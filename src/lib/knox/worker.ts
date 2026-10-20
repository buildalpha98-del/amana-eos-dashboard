import type { Prisma, TriageSubjectType, TriageTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { dispatchLevel, postOpsNote } from "@/lib/knox/alerts";
import { assessWithModel } from "@/lib/knox/assess";
import { buildCards, toPendingActionCreate } from "@/lib/knox/cards";
import { loadSubject } from "@/lib/knox/load-subject";
import { resolveRecipients } from "@/lib/knox/recipients";
import { evaluateRules } from "@/lib/knox/rules";
import { getKnoxSettings } from "@/lib/knox/settings";
import { TIER_RANK, type RulesResult, type TriageClock, type TriageSubject } from "@/lib/knox/types";

/** A job created longer ago than this is backlog: it is assessed but never alerts. */
export const STALE_BACKLOG_MS = 24 * 60 * 60 * 1000;
/** Window in which an earlier alert for the same subject silences a non-raising re-triage. */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 3;

const MIN_MS = 60_000;
const SAFETY_NET_SEVERITIES: ReadonlySet<string> = new Set(["serious", "reportable"]);

export type TriageJobOutcome = "done" | "skipped" | "failed" | "retry" | "not_claimed";

const SUBJECT_LABEL: Record<TriageSubjectType, string> = {
  incident: "an incident",
  complaint: "a complaint",
  staff_incident: "a staff incident report",
};

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}

function clocksJson(clocks: TriageClock[]) {
  return clocks.map((c) => ({ kind: c.kind, dueAt: c.dueAt, basis: c.basis, overdue: c.overdue }));
}

/**
 * Highest tier alerted for this subject in the last 24 h, or null. Only
 * assessments with at least one TriageAlert row count (a marker row for an
 * empty recipient set counts), so an attempt that set `alerted` and then died
 * before anything was sent does not silence the retry.
 */
async function priorAlertedRank(
  subjectType: TriageSubjectType,
  subjectId: string,
  now: Date,
): Promise<number | null> {
  const prior = await prisma.triageAssessment.findMany({
    where: {
      subjectType,
      subjectId,
      alerted: true,
      createdAt: { gte: new Date(now.getTime() - DEDUPE_WINDOW_MS) },
      alerts: { some: {} },
    },
    select: { tier: true },
  });
  if (prior.length === 0) return null;
  return Math.max(...prior.map((p) => TIER_RANK[p.tier]));
}

/**
 * Run one Knox triage job: claim → load → rules → decide → write the
 * assessment → level-0 alerts → model → second safety net → cards → done.
 *
 * Alerts go out BEFORE the model is called; a model failure only downgrades
 * the assessment to rules-only. Any exception after the claim puts the job
 * back to `pending` with exponential back-off (2, 4 min), and on the third
 * attempt marks it `failed` and posts an ops note. Throws only when the claim
 * itself fails (nothing has run yet).
 */
export async function runTriageJob(jobId: string, now: Date = new Date()): Promise<TriageJobOutcome> {
  // 1. Claim atomically.
  const claim = await prisma.triageJob.updateMany({
    where: { id: jobId, status: "pending" },
    data: { status: "running", startedAt: now, attempts: { increment: 1 } },
  });
  if (claim.count === 0) return "not_claimed";

  let job:
    | { subjectType: TriageSubjectType; subjectId: string; serviceId: string; attempts: number; createdAt: Date }
    | null = null;
  let subject: TriageSubject | null = null;

  try {
    job = await prisma.triageJob.findUnique({
      where: { id: jobId },
      select: { subjectType: true, subjectId: true, serviceId: true, attempts: true, createdAt: true },
    });
    if (!job) {
      logger.warn("Knox: claimed job vanished", { jobId });
      return "not_claimed";
    }

    // 2. Load the subject.
    subject = await loadSubject(prisma, job.subjectType, job.subjectId);
    if (!subject) {
      await prisma.triageJob.update({ where: { id: jobId }, data: { status: "skipped", finishedAt: now } });
      return "skipped";
    }
    const subjectType = job.subjectType;
    const subjectId = job.subjectId;
    const serviceId = subject.service.id;

    // 3. Rules.
    const rules = evaluateRules(subject, now);

    // 4. Decide whether to alert.
    const { shadowMode } = await getKnoxSettings();
    const stale = now.getTime() - job.createdAt.getTime() > STALE_BACKLOG_MS;
    const priorRank = await priorAlertedRank(subjectType, subjectId, now);
    const mayAlert = !shadowMode && !stale;
    const alerted =
      mayAlert && rules.tier !== "minor" && (priorRank === null || priorRank < TIER_RANK[rules.tier]);

    // 5. Write the assessment now: TriageAlert rows FK it. A retry reuses the
    // row an earlier attempt wrote for this job (jobId is unique) instead of
    // deleting it, which would cascade away the alert rows the escalation
    // sweep and the acknowledge link depend on.
    const rulesFields = {
      subjectType,
      subjectId,
      serviceId,
      tier: rules.tier,
      ruleHits: rules.ruleHits,
      clocks: clocksJson(rules.clocks),
      source: "rules_only",
    };
    const existing = await prisma.triageAssessment.findUnique({
      where: { jobId },
      select: { id: true, alerted: true },
    });
    const assessment = existing
      ? await prisma.triageAssessment.update({
          where: { id: existing.id },
          data: { ...rulesFields, alerted: alerted || existing.alerted, modelError: null },
          select: { id: true },
        })
      : await prisma.triageAssessment.create({
          data: { jobId, ...rulesFields, alerted },
          select: { id: true },
        });
    const assessmentId = assessment.id;

    // 6. Level-0 alerts, before the model. `false` = nobody to tell (a marker
    // row was written) — not a failure.
    let recipients: Awaited<ReturnType<typeof resolveRecipients>> | null = null;
    if (alerted) {
      recipients = await resolveRecipients(prisma, subject.service);
      await dispatchLevel(prisma, { assessmentId, subject, rules, recipients, level: 0 });
    }

    // 7. Model.
    const result = await assessWithModel(subject, rules);
    let modelUpdate: Prisma.TriageAssessmentUpdateInput;
    if (result.ok) {
      let aiUsageId: string | null = null;
      try {
        const usage = await prisma.aiUsage.create({
          data: {
            userId: null,
            section: "knox",
            model: result.modelId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            durationMs: result.durationMs,
            metadata: { assessmentId, subjectType, subjectId, serviceId },
          },
          select: { id: true },
        });
        aiUsageId = usage.id;
      } catch (err) {
        logger.error("Knox: could not log AI usage", { assessmentId, err: errorText(err) });
      }
      const d = result.data;
      modelUpdate = {
        source: "rules_and_model",
        modelId: result.modelId,
        severityOpinion: d.severityOpinion,
        rationale: d.rationale,
        missingFields: d.missingFields,
        suggestedSeverity: d.suggestedSeverity ?? null,
        suggestedCategory: d.suggestedCategory ?? null,
        parentNoticeDraft: d.parentNoticeDraft ?? null,
        regulatorPackDraft: d.regulatorPackDraft ?? null,
        aiUsageId,
      };
    } else {
      modelUpdate = { modelError: result.error };
    }

    // 8. Second safety net: the rules said minor, the model says it is worse.
    // A MODERATE push to the directors — the human decides whether it is serious.
    // Silenced by any earlier alert for this subject (including an earlier
    // attempt of this job), so a retry never re-sends it.
    if (
      mayAlert &&
      priorRank === null &&
      rules.tier === "minor" &&
      result.ok &&
      result.data.severityOpinion === "understated" &&
      SAFETY_NET_SEVERITIES.has(result.data.suggestedSeverity ?? "")
    ) {
      const raised: RulesResult = { ...rules, tier: "moderate" satisfies TriageTier };
      recipients ??= await resolveRecipients(prisma, subject.service);
      await dispatchLevel(prisma, {
        assessmentId,
        subject,
        rules: raised,
        recipients,
        level: 0,
        rationale: result.data.rationale,
      });
      await prisma.triageAssessment.update({ where: { id: assessmentId }, data: { alerted: true } });
    }

    // 9–10. Model fields, cards and job done land together.
    const cards = shadowMode
      ? []
      : buildCards({ subject, rules, model: result.ok ? result.data : null, now });
    await prisma.$transaction([
      prisma.triageAssessment.update({ where: { id: assessmentId }, data: modelUpdate }),
      ...(cards.length > 0
        ? [
            prisma.pendingAction.createMany({
              data: cards.map((c) =>
                toPendingActionCreate(c, { assessmentId, subjectType, subjectId, serviceId, now }),
              ),
            }),
          ]
        : []),
      prisma.triageJob.update({ where: { id: jobId }, data: { status: "done", finishedAt: now } }),
    ]);
    return "done";
  } catch (err) {
    return failJob(jobId, now, err, job, subject);
  }
}

/** 11. Back off and retry, or give up after MAX_ATTEMPTS and tell ops. Never throws. */
async function failJob(
  jobId: string,
  now: Date,
  err: unknown,
  job: { subjectType: TriageSubjectType; subjectId: string; serviceId: string; attempts: number } | null,
  subject: TriageSubject | null,
): Promise<"retry" | "failed"> {
  const lastError = errorText(err);
  try {
    const attempts =
      job?.attempts ??
      (await prisma.triageJob.findUnique({ where: { id: jobId }, select: { attempts: true } }))?.attempts ??
      MAX_ATTEMPTS;

    if (attempts < MAX_ATTEMPTS) {
      const scheduledFor = new Date(now.getTime() + 2 ** attempts * MIN_MS);
      await prisma.triageJob.update({
        where: { id: jobId },
        data: { status: "pending", scheduledFor, lastError },
      });
      logger.warn("Knox: triage attempt failed, will retry", { jobId, attempts, scheduledFor, err: lastError });
      return "retry";
    }

    await prisma.triageJob.update({
      where: { id: jobId },
      data: { status: "failed", finishedAt: now, lastError },
    });
    logger.error("Knox: triage job failed", { jobId, attempts, err: lastError });
    const label = job ? SUBJECT_LABEL[job.subjectType] : "a record";
    const where = subject ? `${subject.service.name} (${subject.service.id})` : (job?.serviceId ?? "unknown service");
    await postOpsNote(
      `Knox could not assess ${label}`,
      `Knox gave up on ${job?.subjectType ?? "record"} ${job?.subjectId ?? ""} at ${where} after ${attempts} attempts. ` +
        `Please triage it by hand. Last error: ${lastError}`,
    );
    return "failed";
  } catch (inner) {
    logger.error("Knox: could not record triage failure", { jobId, err: lastError, inner: errorText(inner) });
    return "failed";
  }
}

/**
 * Run up to `limit` due jobs, oldest first, one at a time. A job that throws
 * does not stop the rest. `processed` counts jobs this sweep actually claimed.
 */
export async function sweepJobs(now: Date, limit = 25): Promise<{ processed: number }> {
  const due = await prisma.triageJob.findMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
    select: { id: true },
  });
  let processed = 0;
  for (const { id } of due) {
    try {
      const outcome = await runTriageJob(id);
      if (outcome !== "not_claimed") processed++;
    } catch (err) {
      logger.error("Knox: sweep could not run job", { jobId: id, err: errorText(err) });
    }
  }
  return { processed };
}
