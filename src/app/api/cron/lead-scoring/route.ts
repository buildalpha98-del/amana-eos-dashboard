import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const MAX_LEADS_PER_RUN = 20;
const STALE_DAYS = 7;

/**
 * GET /api/cron/lead-scoring
 *
 * Daily cron — scores leads in active pipeline stages that haven't been
 * scored in 7+ days (or never scored). Processes up to 20 per run.
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("lead-scoring", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  const ai = getAI();
  if (!ai) {
    await guard.fail(new Error("AI not configured"));
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  try {
    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - STALE_DAYS);

    // Find leads in active stages that need scoring
    const leads = await prisma.lead.findMany({
      where: {
        deleted: false,
        pipelineStage: {
          notIn: ["won", "lost"],
        },
        OR: [
          { aiScoredAt: null },
          { aiScoredAt: { lt: staleThreshold } },
        ],
      },
      include: {
        assignedTo: { select: { name: true } },
        service: { select: { name: true, code: true } },
        touchpoints: {
          orderBy: { sentAt: "desc" },
          take: 15,
          include: {
            sentBy: { select: { name: true } },
          },
        },
      },
      orderBy: [
        { aiScoredAt: { sort: "asc", nulls: "first" } },
        { updatedAt: "desc" },
      ],
      take: MAX_LEADS_PER_RUN,
    });

    if (leads.length === 0) {
      await guard.complete({ scored: 0, message: "No leads need scoring" });
      return NextResponse.json({ message: "No leads need scoring", scored: 0 });
    }

    // Get a system user for AI usage logging
    const systemUser = await prisma.user.findFirst({
      where: { role: "owner" },
      select: { id: true },
    });

    if (!systemUser) {
      await guard.fail(new Error("No owner user found for AI usage logging"));
      return NextResponse.json({ error: "No system user" }, { status: 500 });
    }

    let scored = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        const leadData = buildLeadDataSummary(lead);

        const prompt = `Score this lead from 0-100 based on data completeness, engagement signals, and conversion likelihood.

Lead Data:
${leadData}

Respond in JSON format only, no other text:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence assessment>",
  "factors": ["<positive or negative factor>", ...]
}

Scoring criteria:
- Contact completeness (name, email, phone, address): 0-20 points
- Source quality (referral > website > tender > direct): 0-15 points
- Engagement level (touchpoints, notes, responses): 0-25 points
- Pipeline progression speed: 0-15 points
- Service match (linked service or estimated capacity): 0-15 points
- Recency (recent activity scores higher): 0-10 points`;

        const startTime = Date.now();

        const response = await ai.messages.create({
          model: "claude-3-5-haiku-latest",
          max_tokens: 512,
          system: AMANA_SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        });

        const block = response.content[0];
        if (block.type !== "text") {
          failed++;
          continue;
        }

        const durationMs = Date.now() - startTime;
        const parsed = parseScoreResponse(block.text);

        if (!parsed) {
          logger.error("Failed to parse score for lead", { leadId: lead.id });
          failed++;
          continue;
        }

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            aiScore: parsed.score,
            aiScoreSummary: parsed.summary,
            aiScoredAt: new Date(),
          },
        });

        // Log AI usage
        await prisma.aiUsage.create({
          data: {
            userId: systemUser.id,
            templateSlug: "crm/lead-scoring",
            model: "claude-3-5-haiku-latest",
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            durationMs,
            section: "crm",
            metadata: {
              leadId: lead.id,
              score: parsed.score,
              cron: true,
            } as Prisma.InputJsonValue,
          },
        });

        scored++;
      } catch (err) {
        logger.error("Failed to score lead", { leadId: lead.id, err });
        failed++;
      }
    }

    await guard.complete({ scored, failed, total: leads.length });

    return NextResponse.json({
      message: "Lead scoring complete",
      scored,
      failed,
      total: leads.length,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Lead scoring cron failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLeadDataSummary(lead: {
  schoolName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  source: string;
  pipelineStage: string;
  tenderRef: string | null;
  estimatedCapacity: number | null;
  notes: string | null;
  buildAlphaKidsStatus: string | null;
  communityConnections: string | null;
  stageChangedAt: Date;
  nextTouchpointAt: Date | null;
  createdAt: Date;
  assignedTo: { name: string } | null;
  service: { name: string; code: string } | null;
  touchpoints: {
    type: string;
    subject: string | null;
    body: string | null;
    sentAt: Date;
    sentBy: { name: string } | null;
  }[];
}): string {
  const lines: string[] = [];

  lines.push(`School: ${lead.schoolName}`);
  lines.push(`Contact Name: ${lead.contactName || "Not provided"}`);
  lines.push(`Contact Email: ${lead.contactEmail || "Not provided"}`);
  lines.push(`Contact Phone: ${lead.contactPhone || "Not provided"}`);
  lines.push(`Address: ${[lead.address, lead.suburb, lead.state, lead.postcode].filter(Boolean).join(", ") || "Not provided"}`);
  lines.push(`Source: ${lead.source}`);
  lines.push(`Pipeline Stage: ${lead.pipelineStage}`);
  lines.push(`Assigned To: ${lead.assignedTo?.name || "Unassigned"}`);
  lines.push(`Estimated Capacity: ${lead.estimatedCapacity ?? "Not provided"}`);
  lines.push(`Linked Service: ${lead.service ? `${lead.service.name} (${lead.service.code})` : "None"}`);

  if (lead.tenderRef) lines.push(`Tender Ref: ${lead.tenderRef}`);

  const daysInStage = Math.floor(
    (Date.now() - new Date(lead.stageChangedAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  lines.push(`Days in current stage: ${daysInStage}`);
  lines.push(`Days since created: ${daysSinceCreated}`);

  if (lead.notes) {
    lines.push(`Notes: ${lead.notes.slice(0, 300)}`);
  }

  lines.push(`\nTouchpoints (${lead.touchpoints.length} total):`);
  for (const tp of lead.touchpoints.slice(0, 10)) {
    const date = new Date(tp.sentAt).toISOString().split("T")[0];
    lines.push(`  - ${date} [${tp.type}] ${tp.subject || "(no subject)"}`);
  }

  return lines.join("\n");
}

function parseScoreResponse(text: string): {
  score: number;
  summary: string;
  factors: string[];
} | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
    const summary = String(parsed.summary || "");
    const factors = Array.isArray(parsed.factors)
      ? parsed.factors.map(String)
      : [];

    if (isNaN(score)) return null;

    return { score, summary, factors };
  } catch {
    return null;
  }
}
