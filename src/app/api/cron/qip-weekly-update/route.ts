import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { generateText } from "@/lib/ai";
import { sendNotificationEmail } from "@/lib/notifications/sendEmail";
import {
  mondayOfWeekSydney,
  buildEvidenceExcerpts,
  parseTagResponse,
  parseChangesResponse,
  excerptOf,
  type EvidenceItem,
} from "@/lib/qip-weekly";

const TAG_BATCH_SIZE = 10;
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks — covers reruns without going stale

const QA_NAMES: Record<number, string> = {
  1: "Educational Program and Practice",
  2: "Children's Health and Safety",
  3: "Physical Environment",
  4: "Staffing Arrangements",
  5: "Relationships with Children",
  6: "Collaborative Partnerships",
  7: "Governance and Leadership",
};

/**
 * Cached AI call: sha256 the rendered prompt, reuse a fresh cache row when
 * present, otherwise call the model and store the raw text output.
 */
async function cachedGenerate(
  kind: string,
  prompt: string,
  opts: { model: string; maxTokens: number },
): Promise<string> {
  const inputHash = createHash("sha256").update(prompt).digest("hex");
  const cached = await prisma.aiGenerationCache.findUnique({
    where: { kind_inputHash: { kind, inputHash } },
  });
  if (cached && cached.expiresAt > new Date()) {
    return typeof cached.output === "string"
      ? cached.output
      : JSON.stringify(cached.output);
  }

  const text = await generateText(prompt, {
    model: opts.model,
    maxTokens: opts.maxTokens,
  });

  await prisma.aiGenerationCache
    .upsert({
      where: { kind_inputHash: { kind, inputHash } },
      create: {
        kind,
        inputHash,
        output: text,
        provider: "anthropic",
        modelId: opts.model,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      },
      update: {
        output: text,
        modelId: opts.model,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      },
    })
    .catch((err) => logger.warn("qip-weekly-update: cache write failed", { err }));

  return text;
}

interface Template {
  model: string;
  maxTokens: number;
  promptTemplate: string;
}

async function loadTemplate(slug: string): Promise<Template | null> {
  const t = await prisma.aiPromptTemplate.findUnique({ where: { slug } });
  return t as Template | null;
}

/**
 * GET /api/cron/qip-weekly-update
 *
 * Friday ~4pm AEST. Three phases per service with a QIP/SAT:
 *  1. Sweep — AI-backfill NQS/MTOP tags on the week's untagged content
 *     (aiTagged=true marks machine provenance).
 *  2. Suggest — per quality area with new evidence, ask the model whether the
 *     week's evidence warrants updating the document; store proposals as
 *     pending QipSuggestion rows (review-gated, never auto-applied).
 *  3. Notify — email the service coordinator + org admins when suggestions
 *     are waiting.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      message: "ANTHROPIC_API_KEY not configured, skipping",
      skipped: true,
    });
  }

  const guard = await acquireCronLock("qip-weekly-update", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const weekStart = mondayOfWeekSydney(now);
    const baseUrl = process.env.NEXTAUTH_URL || "https://amanaoshc.company";

    const tagTemplate = await loadTemplate("nqs/tag-content");
    const updateTemplate = await loadTemplate("compliance/qip-weekly-update");
    if (!tagTemplate || !updateTemplate) {
      await guard.fail("AI templates missing");
      return NextResponse.json(
        { error: "nqs/tag-content or compliance/qip-weekly-update template missing" },
        { status: 500 },
      );
    }

    const qips = await prisma.qualityImprovementPlan.findMany({
      include: {
        service: { select: { id: true, name: true, state: true } },
        qualityAreas: true,
      },
    });

    let tagged = 0;
    let suggestionsCreated = 0;
    let notified = 0;

    for (const qip of qips) {
      const serviceId = qip.serviceId;

      // ── Phase 1: tag sweep ────────────────────────────────────────────
      const untaggedReflections = await prisma.staffReflection.findMany({
        where: {
          serviceId,
          createdAt: { gte: weekStart, lte: now },
          qualityAreas: { isEmpty: true },
        },
        select: { id: true, content: true, createdAt: true },
      });
      const untaggedObservations = await prisma.learningObservation.findMany({
        where: {
          serviceId,
          createdAt: { gte: weekStart, lte: now },
          mtopOutcomes: { isEmpty: true },
        },
        select: { id: true, narrative: true, createdAt: true },
      });

      const sweepItems = [
        ...untaggedReflections.map((r) => ({
          table: "reflection" as const,
          id: r.id,
          content: r.content,
          createdAt: r.createdAt,
        })),
        ...untaggedObservations.map((o) => ({
          table: "observation" as const,
          id: o.id,
          content: o.narrative,
          createdAt: o.createdAt,
        })),
      ];

      for (let i = 0; i < sweepItems.length; i += TAG_BATCH_SIZE) {
        const batch = sweepItems.slice(i, i + TAG_BATCH_SIZE);
        const itemsBlock = buildEvidenceExcerpts(
          batch.map((b) => ({
            kind: b.table,
            id: b.id,
            date: b.createdAt,
            content: b.content,
          })),
        );
        const prompt = tagTemplate.promptTemplate.replaceAll("{{items}}", itemsBlock);
        let response: string;
        try {
          response = await cachedGenerate("nqs-tag-content", prompt, {
            model: tagTemplate.model,
            maxTokens: tagTemplate.maxTokens,
          });
        } catch (err) {
          logger.warn("qip-weekly-update: tag batch failed", { serviceId, err });
          continue;
        }
        const parsedTags = parseTagResponse(response);
        if (!parsedTags) {
          logger.warn("qip-weekly-update: malformed tag response", { serviceId });
          continue;
        }
        for (const tagItem of parsedTags.items) {
          const target = batch[tagItem.index - 1];
          if (!target) continue;
          if (target.table === "reflection") {
            await prisma.staffReflection.update({
              where: { id: target.id },
              data: {
                qualityAreas: tagItem.qualityAreas,
                mtopOutcomes: tagItem.mtopOutcomes,
                aiTagged: true,
              },
            });
          } else {
            await prisma.learningObservation.update({
              where: { id: target.id },
              data: { mtopOutcomes: tagItem.mtopOutcomes, aiTagged: true },
            });
          }
          tagged++;
        }
      }

      // ── Phase 2: suggestions per quality area ─────────────────────────
      const weekReflections = await prisma.staffReflection.findMany({
        where: {
          serviceId,
          createdAt: { gte: weekStart, lte: now },
          NOT: { qualityAreas: { isEmpty: true } },
        },
        select: {
          id: true,
          title: true,
          content: true,
          qualityAreas: true,
          mtopOutcomes: true,
          createdAt: true,
          linkedObservationIds: true,
        },
      });
      if (weekReflections.length === 0) continue;

      // Fanned-out observations ride along inside their source reflection's block.
      const linkedObsIds = weekReflections.flatMap((r) => r.linkedObservationIds);
      const linkedObs = linkedObsIds.length
        ? await prisma.learningObservation.findMany({
            where: { id: { in: linkedObsIds } },
            select: { id: true, narrative: true, mtopOutcomes: true, createdAt: true },
          })
        : [];
      const obsById = new Map(linkedObs.map((o) => [o.id, o]));

      const pendingByQa = new Map<number, string[]>();
      const pendingRows = await prisma.qipSuggestion.findMany({
        where: { qipId: qip.id, status: "pending" },
        select: { qualityArea: true, field: true, proposedText: true },
      });
      for (const p of pendingRows) {
        const list = pendingByQa.get(p.qualityArea) ?? [];
        list.push(`[${p.field}] ${excerptOf(p.proposedText)}`);
        pendingByQa.set(p.qualityArea, list);
      }

      const documentType = qip.documentType === "sat" ? "SAT" : "QIP";
      let serviceSuggestions = 0;

      for (const area of qip.qualityAreas) {
        const qaReflections = weekReflections.filter((r) =>
          r.qualityAreas.includes(area.qualityArea),
        );
        if (qaReflections.length === 0) continue;

        const evidence: EvidenceItem[] = qaReflections.flatMap((r) => {
          const own: EvidenceItem = {
            kind: "reflection",
            id: r.id,
            date: r.createdAt,
            content: r.content,
            mtopOutcomes: r.mtopOutcomes,
            childCount: r.linkedObservationIds.length || undefined,
          };
          const rides = r.linkedObservationIds
            .map((oid) => obsById.get(oid))
            .filter(Boolean)
            .map((o) => ({
              kind: "observation" as const,
              id: o!.id,
              date: o!.createdAt,
              content: o!.narrative,
              mtopOutcomes: o!.mtopOutcomes,
            }));
          return [own, ...rides];
        });

        const currentFields = [
          `strengths: ${area.strengths || "(empty)"}`,
          `areasForImprovement: ${area.areasForImprovement || "(empty)"}`,
          `progressNotes: ${area.progressNotes || "(empty)"}`,
          `evidenceCollected: ${area.evidenceCollected || "(empty)"}`,
        ].join("\n");

        const prompt = updateTemplate.promptTemplate
          .replaceAll("{{documentType}}", documentType)
          .replaceAll("{{qualityArea}}", String(area.qualityArea))
          .replaceAll(
            "{{qualityAreaName}}",
            area.qualityAreaName || QA_NAMES[area.qualityArea] || "",
          )
          .replaceAll("{{currentFields}}", currentFields)
          .replaceAll("{{evidence}}", buildEvidenceExcerpts(evidence))
          .replaceAll(
            "{{pendingProposals}}",
            pendingByQa.get(area.qualityArea)?.join("\n") || "(none)",
          );

        let response: string;
        try {
          response = await cachedGenerate("qip-weekly-update", prompt, {
            model: updateTemplate.model,
            maxTokens: updateTemplate.maxTokens,
          });
        } catch (err) {
          logger.warn("qip-weekly-update: QA generation failed", {
            serviceId,
            qualityArea: area.qualityArea,
            err,
          });
          continue;
        }

        const parsed = parseChangesResponse(response);
        if (!parsed) {
          logger.warn("qip-weekly-update: malformed changes response", {
            serviceId,
            qualityArea: area.qualityArea,
          });
          continue;
        }

        const currentByField: Record<string, string | null> = {
          strengths: area.strengths,
          areasForImprovement: area.areasForImprovement,
          progressNotes: area.progressNotes,
          evidenceCollected: area.evidenceCollected,
        };

        for (const change of parsed.changes) {
          await prisma.qipSuggestion.create({
            data: {
              qipId: qip.id,
              qualityArea: area.qualityArea,
              field: change.field,
              currentText: currentByField[change.field] ?? null,
              proposedText: change.proposedText,
              rationale: change.rationale,
              evidenceRefs: evidence.map((e) => ({
                type: e.kind,
                id: e.id,
                excerpt: excerptOf(e.content),
              })),
              weekOf: weekStart,
            },
          });
          serviceSuggestions++;
          suggestionsCreated++;
        }
      }

      // ── Phase 3: notify reviewers ─────────────────────────────────────
      if (serviceSuggestions > 0) {
        const reviewers = await prisma.user.findMany({
          where: {
            active: true,
            OR: [
              { serviceId, role: "member" },
              { role: { in: ["admin", "head_office", "owner"] } },
            ],
          },
          select: { id: true, name: true, email: true },
        });
        const link = `${baseUrl}/services/${serviceId}?tab=compliance&sub=qip`;
        for (const user of reviewers) {
          try {
            await sendNotificationEmail({
              to: user.email,
              toName: user.name ?? undefined,
              subject: `${serviceSuggestions} ${documentType} update${serviceSuggestions === 1 ? "" : "s"} ready for review — ${qip.service.name}`,
              html: `<p>Hi ${user.name || "there"},</p><p>The weekly AI review found ${serviceSuggestions} proposed update${serviceSuggestions === 1 ? "" : "s"} to the ${documentType} for <strong>${qip.service.name}</strong>, based on this week's reflections and observations.</p><p><a href="${link}">Review and approve them here</a> — nothing changes in the document until you accept it.</p>`,
              type: "qip_suggestions_ready",
              relatedId: qip.id,
              relatedType: "QualityImprovementPlan",
            });
            notified++;
          } catch (err) {
            logger.warn("qip-weekly-update: notify failed", {
              userId: user.id,
              err,
            });
          }
        }
      }
    }

    const summary = { services: qips.length, tagged, suggestionsCreated, notified };
    logger.info("qip-weekly-update completed", summary);
    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
