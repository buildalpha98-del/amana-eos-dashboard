import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { hasFeature } from "@/lib/role-permissions";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import type { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * POST /api/crm/leads/[id]/score
 *
 * Score a single lead using AI. Gathers all lead data, calls the AI,
 * parses the JSON response, and updates the lead with score + summary.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const role = session!.user.role as Role;
  if (!hasFeature(role, "crm.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ai = getAI();
  if (!ai) {
    return NextResponse.json(
      { error: "AI is not configured. Set ANTHROPIC_API_KEY environment variable." },
      { status: 503 },
    );
  }

  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, code: true } },
      touchpoints: {
        orderBy: { sentAt: "desc" },
        take: 30,
        include: {
          sentBy: { select: { name: true } },
        },
      },
    },
  });

  if (!lead || lead.deleted) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Build lead data summary for AI
  const leadData = buildLeadDataSummary(lead);

  const prompt = `Score this lead from 0-100 based on data completeness, engagement signals, and conversion likelihood.

Lead Data:
${leadData}

Respond in JSON format:
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

  try {
    const response = await ai.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 512,
      system: AMANA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      return NextResponse.json({ error: "Unexpected AI response format" }, { status: 500 });
    }

    const durationMs = Date.now() - startTime;

    // Parse the JSON response
    const parsed = parseScoreResponse(block.text);
    if (!parsed) {
      return NextResponse.json(
        { error: "Failed to parse AI scoring response" },
        { status: 500 },
      );
    }

    // Update lead with score
    const updated = await prisma.lead.update({
      where: { id },
      data: {
        aiScore: parsed.score,
        aiScoreSummary: parsed.summary,
        aiScoredAt: new Date(),
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
        service: { select: { id: true, name: true, code: true } },
      },
    });

    // Log AI usage
    await prisma.aiUsage.create({
      data: {
        userId: session!.user.id,
        templateSlug: "crm/lead-scoring",
        model: "claude-3-5-haiku-latest",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs,
        section: "crm",
        metadata: { leadId: id, score: parsed.score } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      ...updated,
      aiScoreFactors: parsed.factors,
    });
  } catch (err) {
    console.error("Lead scoring failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scoring failed" },
      { status: 500 },
    );
  }
}

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
  lines.push(`Build Alpha Kids Status: ${lead.buildAlphaKidsStatus || "Unknown"}`);
  lines.push(`Community Connections: ${lead.communityConnections || "None noted"}`);

  if (lead.tenderRef) lines.push(`Tender Ref: ${lead.tenderRef}`);

  const daysInStage = Math.floor(
    (Date.now() - new Date(lead.stageChangedAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  lines.push(`Days in current stage: ${daysInStage}`);
  lines.push(`Days since created: ${daysSinceCreated}`);

  if (lead.nextTouchpointAt) {
    lines.push(`Next touchpoint: ${new Date(lead.nextTouchpointAt).toISOString().split("T")[0]}`);
  }

  if (lead.notes) {
    lines.push(`Notes: ${lead.notes.slice(0, 500)}`);
  }

  lines.push(`\nTouchpoints (${lead.touchpoints.length} total):`);
  for (const tp of lead.touchpoints.slice(0, 15)) {
    const date = new Date(tp.sentAt).toISOString().split("T")[0];
    const by = tp.sentBy?.name || "system";
    lines.push(`  - ${date} [${tp.type}] ${tp.subject || ""} (by ${by})`);
  }

  return lines.join("\n");
}

function parseScoreResponse(text: string): {
  score: number;
  summary: string;
  factors: string[];
} | null {
  try {
    // Extract JSON from the response (may be wrapped in markdown code blocks)
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
