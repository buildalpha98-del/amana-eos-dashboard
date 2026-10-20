import type { Prisma, PrismaClient, TriageSubjectType, TriageTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { dispatchLevel, postOpsNote } from "@/lib/knox/alerts";
import { assessWithModel } from "@/lib/knox/assess";
import { enqueueTriage } from "@/lib/knox/enqueue";
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
/**
 * A job `running` longer than this was abandoned (process died, or recording
 * its failure itself failed). The longest legitimate run is one 20 s model
 * timeout plus I/O, so 10 minutes is far past any live job.
 */
export const STALE_RUNNING_MS = 10 * 60 * 1000;
const DEFAULT_SWEEP_LIMIT = 10;
/** Leaves headroom inside the tick's 300 s maxDuration (escalation and reconciliation run before it). */
const DEFAULT_SWEEP_BUDGET_MS = 240_000;

const MIN_MS = 60_000;
const SAFETY_NET_SEVERITIES: ReadonlySet<string> = new Set(["serious", "reportable"]);

export type TriageJobOutcome = "done" | "skipped" | "failed" | "retry" | "not_claimed" | "disabled";

const SUBJECT_LABEL: Record<TriageSubjectType, string> = {
  incident: "an incident",
  complaint: "a complaint",
  staff_incident: "a staff incident report",
};

const FOLLOWUP_KIND = "create_followup_todos";

/** Knox's own cards for a record that a person can still approve. */
function openKnoxCards(subjectType: TriageSubjectType, subjectId: string, now: Date) {
  return {
    subjectType,
    subjectId,
    proposedBy: "knox",
    committedAt: null,
    dismissedAt: null,
    expiresAt: { gt: now },
  } satisfies Prisma.PendingActionWhereInput;
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}

function clocksJson(clocks: TriageClock[]) {
  return clocks.map((c) => ({ kind: c.kind, dueAt: c.dueAt, basis: c.basis, overdue: c.overdue }));
}

/**
 * Highest tier alerted for this subject in the last 24 h, or null. The signal
 * is the TriageAlert rows themselves (a marker row for an empty recipient set
 * counts), NOT the `alerted` flag: an attempt that set the flag and died before
 * sending must not silence its retry, and one that sent but died before
 * setting the flag must not send twice.
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
 * attempt marks it `failed` and posts an ops note. While Knox is disabled it
 * returns `"disabled"` without claiming, so the job stays pending for when
 * Knox is switched on. Throws only when the settings read or the claim fails
 * (nothing has run yet).
 */
export async function runTriageJob(jobId: string, now: Date = new Date()): Promise<TriageJobOutcome> {
  const { enabled, shadowMode } = await getKnoxSettings();
  if (!enabled) return "disabled";

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
    // attempt of this job), so a retry never re-sends it. `alerted` is set
    // BEFORE the push, the same as level 0.
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
      await prisma.triageAssessment.update({ where: { id: assessmentId }, data: { alerted: true } });
      await dispatchLevel(prisma, {
        assessmentId,
        subject,
        rules: raised,
        recipients,
        level: 0,
        rationale: result.data.rationale,
      });
    }

    // 9–10. Model fields, cards and job done land together.
    let cards = shadowMode
      ? []
      : buildCards({ subject, rules, model: result.ok ? result.data : null, now });
    // Never a second to-do card while one is still open for this record:
    // approving both would create the to-dos twice.
    if (cards.some((c) => c.kind === FOLLOWUP_KIND)) {
      const openTodoCard = await prisma.pendingAction.findFirst({
        where: { ...openKnoxCards(subjectType, subjectId, now), kind: FOLLOWUP_KIND },
        select: { id: true },
      });
      if (openTodoCard) cards = cards.filter((c) => c.kind !== FOLLOWUP_KIND);
    }
    // A fresh card replaces any still-open Knox card of the same kind for this
    // record, so an older `mark_reportable` cannot be approved over a newer one.
    const supersededKinds = [...new Set(cards.map((c) => c.kind))].filter((k) => k !== FOLLOWUP_KIND);
    await prisma.$transaction([
      prisma.triageAssessment.update({ where: { id: assessmentId }, data: modelUpdate }),
      ...(supersededKinds.length > 0
        ? [
            prisma.pendingAction.updateMany({
              where: { ...openKnoxCards(subjectType, subjectId, now), kind: { in: supersededKinds } },
              data: { dismissedAt: now, dismissReason: "superseded" },
            }),
          ]
        : []),
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
 * Tick body: first return abandoned `running` jobs to `pending`, then run up
 * to `limit` due jobs, oldest first, one at a time, stopping between jobs once
 * `budgetMs` has elapsed. A job that throws does not stop the rest.
 * `processed` counts jobs this sweep actually claimed. No-op while Knox is
 * disabled (the tick gates on that too).
 */
export async function sweepJobs(
  now: Date,
  opts: { limit?: number; budgetMs?: number } = {},
): Promise<{ processed: number; reaped: number }> {
  const limit = opts.limit ?? DEFAULT_SWEEP_LIMIT;
  const budgetMs = opts.budgetMs ?? DEFAULT_SWEEP_BUDGET_MS;
  const startedAt = Date.now();

  if (!(await getKnoxSettings()).enabled) return { processed: 0, reaped: 0 };

  const reap = await prisma.triageJob.updateMany({
    where: { status: "running", startedAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) } },
    data: { status: "pending", scheduledFor: now, lastError: "reaped: stale running" },
  });
  if (reap.count > 0) logger.warn("Knox: reaped stale running jobs", { count: reap.count });

  const due = await prisma.triageJob.findMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
    select: { id: true },
  });
  let processed = 0;
  for (const [i, { id }] of due.entries()) {
    if (i > 0 && Date.now() - startedAt >= budgetMs) {
      logger.info("Knox: sweep budget spent, leaving jobs for the next tick", {
        left: due.length - i,
        budgetMs,
      });
      break;
    }
    try {
      const outcome = await runTriageJob(id);
      if (outcome !== "not_claimed" && outcome !== "disabled") processed++;
    } catch (err) {
      logger.error("Knox: sweep could not run job", { jobId: id, err: errorText(err) });
    }
  }
  return { processed, reaped: reap.count };
}

// ── Reconciliation ───────────────────────────────────────

/** How far back the reconciliation pass looks for register rows with no job. */
export const RECONCILE_WINDOW_MS = 6 * 60 * 60 * 1000;
/**
 * Rows whose EVENT (incident date, complaint received, staff incident
 * occurred) is older than this are not reconciled. The pass exists to catch a
 * lost enqueue for a fresh record; without this bound a CSV import of last
 * year's incidents (`/api/incidents/import`, deliberately not a Knox writer)
 * would be queued — as new jobs, so past the backlog guard — and alert.
 */
export const RECONCILE_EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECONCILE_TAKE = 200;

/**
 * Safety net for a lost enqueue: queue a `sweep` job for every register row
 * created in the last `RECONCILE_WINDOW_MS` that has NO `TriageJob` at all.
 * A job insert can fail after the record committed (`triggerTriage` swallows
 * it), the OWNA sync's post-`createMany` re-read can throw, and its update
 * batches can throw before their triggers run; without this pass those
 * records are never triaged. Bounded to `RECONCILE_TAKE` rows per register,
 * newest first. Runs from the tick BEFORE `sweepJobs`, so a reconciled job is
 * picked up in the same tick. Soft-deleted incidents are skipped.
 */
export async function reconcileMissingJobs(db: PrismaClient, now: Date): Promise<{ reconciled: number }> {
  const createdAt = { gte: new Date(now.getTime() - RECONCILE_WINDOW_MS) };
  const eventSince = { gte: new Date(now.getTime() - RECONCILE_EVENT_WINDOW_MS) };
  const page = { select: { id: true, serviceId: true }, orderBy: { createdAt: "desc" }, take: RECONCILE_TAKE } as const;

  const [incidents, complaints, staffIncidents] = await Promise.all([
    db.incidentRecord.findMany({ where: { createdAt, deleted: false, incidentDate: eventSince }, ...page }),
    db.complaintRecord.findMany({ where: { createdAt, receivedAt: eventSince }, ...page }),
    db.staffIncidentReport.findMany({ where: { createdAt, occurredAt: eventSince }, ...page }),
  ]);
  const registers: Array<[TriageSubjectType, Array<{ id: string; serviceId: string }>]> = [
    ["incident", incidents],
    ["complaint", complaints],
    ["staff_incident", staffIncidents],
  ];

  let reconciled = 0;
  for (const [subjectType, rows] of registers) {
    if (rows.length === 0) continue;
    const jobs = await db.triageJob.findMany({
      where: { subjectType, subjectId: { in: rows.map((r) => r.id) } },
      select: { subjectId: true },
    });
    const hasJob = new Set(jobs.map((j) => j.subjectId));
    for (const row of rows) {
      if (hasJob.has(row.id)) continue;
      const jobId = await enqueueTriage(db, {
        subjectType,
        subjectId: row.id,
        serviceId: row.serviceId,
        reason: "sweep",
      });
      if (jobId) reconciled++;
    }
  }
  if (reconciled > 0) logger.warn("Knox: reconciled register rows that had no triage job", { reconciled });
  return { reconciled };
}
