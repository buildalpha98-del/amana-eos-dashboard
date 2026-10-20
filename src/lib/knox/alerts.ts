import type { Prisma, PrismaClient, TriageSubjectType, TriageTier } from "@prisma/client";
import { logger } from "@/lib/logger";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { notifyUsers } from "@/lib/notify-user";
import { sendTeamsNotification } from "@/lib/teams-notify";
import { resolveRecipients, type Recipient, type Recipients } from "@/lib/knox/recipients";
import { loadSubject } from "@/lib/knox/load-subject";
import { buildContent, type AlertContent } from "@/lib/knox/teams-card";
import type { RulesResult, TriageClock, TriageSubject } from "@/lib/knox/types";

type Db = PrismaClient | Prisma.TransactionClient;
type Level = 0 | 1 | 2;

/**
 * Minutes after the level-0 alert at which the next level is sent. Cumulative
 * from level 0, not from the previous level, so a late tick cannot push the
 * later levels out. Minor never escalates.
 */
export const ESCALATION = { moderate: [60], serious: [15, 30] } as const;

const SWEEP_LOOKBACK_MS = 24 * 60 * 60_000;
const MIN_MS = 60_000;

// ── Links ────────────────────────────────────────────────

/** In-app link that opens the record with the Knox acknowledge bar. */
export function recordLink(
  subjectType: TriageSubjectType,
  subjectId: string,
  assessmentId: string,
): string {
  if (subjectType === "incident") {
    return `/incidents?knox=${assessmentId}&incident=${subjectId}`;
  }
  return `/knox?subject=${subjectType}:${subjectId}`;
}

/** Same page as `recordLink` without the Knox acknowledge context. */
function openRecordLink(subjectType: TriageSubjectType, subjectId: string): string {
  if (subjectType === "incident") return `/incidents?incident=${subjectId}`;
  return `/knox?subject=${subjectType}:${subjectId}`;
}

function absolute(path: string): string {
  const base = (process.env.NEXTAUTH_URL || "https://amanaoshc.company").replace(/\/$/, "");
  return `${base}${path}`;
}

function knoxWebhook(): string | undefined {
  return process.env.TEAMS_KNOX_WEBHOOK_URL || process.env.TEAMS_WEBHOOK_URL || undefined;
}

// ── Sending ──────────────────────────────────────────────

function uniqueById(...groups: Recipient[][]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of groups.flat()) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

interface AlertRow {
  assessmentId: string;
  serviceId: string;
  tier: TriageTier;
  recipientUserId: string | null;
  channel: "push" | "teams";
  escalationLevel: number;
  delivered: boolean;
}

interface Dispatch {
  db: Db;
  assessmentId: string;
  subject: TriageSubject;
  rules: RulesResult;
  level: Level;
  content: AlertContent;
  rows: AlertRow[];
}

async function sendPush(d: Dispatch, to: Recipient[]): Promise<void> {
  if (to.length === 0) return;
  let delivered = false;
  try {
    const count = await notifyUsers(
      d.db,
      to.map((r) => r.id),
      {
        type: NOTIFICATION_TYPES.KNOX_ALERT,
        title: d.content.title,
        body: d.content.body,
        link: recordLink(d.subject.type, d.subject.record.id, d.assessmentId),
      },
    );
    delivered = count > 0;
  } catch (err) {
    logger.error("Knox: push alert failed", {
      assessmentId: d.assessmentId,
      level: d.level,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  for (const r of to) {
    d.rows.push({
      assessmentId: d.assessmentId,
      serviceId: d.subject.service.id,
      tier: d.rules.tier,
      recipientUserId: r.id,
      channel: "push",
      escalationLevel: d.level,
      delivered,
    });
  }
}

async function sendCard(d: Dispatch, mention: Recipient[]): Promise<void> {
  const id = d.subject.record.id;
  let delivered = false;
  try {
    delivered = await sendTeamsNotification({
      title: d.content.title,
      body: d.content.body,
      accentColor: d.content.accentColor,
      facts: d.content.facts,
      actions: [
        {
          type: "Action.OpenUrl",
          title: "Acknowledge",
          url: absolute(recordLink(d.subject.type, id, d.assessmentId)),
        },
        {
          type: "Action.OpenUrl",
          title: "Open record",
          url: absolute(openRecordLink(d.subject.type, id)),
        },
      ],
      webhookUrl: knoxWebhook(),
      mentions: mention.map((r) => ({ email: r.email, name: r.name ?? r.email })),
    });
  } catch (err) {
    logger.error("Knox: Teams alert failed", {
      assessmentId: d.assessmentId,
      level: d.level,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  d.rows.push({
    assessmentId: d.assessmentId,
    serviceId: d.subject.service.id,
    tier: d.rules.tier,
    recipientUserId: null,
    channel: "teams",
    escalationLevel: d.level,
    delivered,
  });
}

/**
 * Post a plain card (no mentions) to the Knox channel. Used for operational
 * notes such as "no Director of Service configured". Never throws.
 */
export async function postOpsNote(title: string, body: string): Promise<void> {
  try {
    await sendTeamsNotification({ title, body, webhookUrl: knoxWebhook() });
  } catch (err) {
    logger.error("Knox: ops note failed", {
      title,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Send one escalation level for an assessment and record one `TriageAlert`
 * row per recipient per channel.
 *
 *   level 0  moderate: Directors (State Managers when there is no Director)
 *            serious:  the above + State Managers, plus a Teams card
 *   level 1  moderate: State Managers
 *            serious:  Teams card mentioning owners + push to owners
 *   level 2  serious:  Teams card mentioning owners again
 *
 * Minor never alerts. Returns true when at least one real alert went out;
 * false when the level had nobody to notify (a marker row is recorded so the
 * sweep does not repeat it). Does not set `TriageAssessment.alerted`; the caller owns
 * that flag (the sweep only considers assessments where it is true).
 */
export async function dispatchLevel(
  db: Db,
  args: {
    assessmentId: string;
    subject: TriageSubject;
    rules: RulesResult;
    recipients: Recipients;
    level: Level;
    rationale?: string | null;
  },
): Promise<boolean> {
  const { assessmentId, subject, rules, recipients, level, rationale } = args;
  if (rules.tier === "minor") return false;

  const d: Dispatch = {
    db,
    assessmentId,
    subject,
    rules,
    level,
    content: buildContent(subject, rules, level, rationale),
    rows: [],
  };
  const serious = rules.tier === "serious";

  if (level === 0) {
    if (recipients.noDirector) {
      await postOpsNote(
        "Knox: no Director of Service",
        `No Director of Service configured for ${subject.service.name}. State Managers have been alerted instead.`,
      );
      await sendPush(d, recipients.stateManagers);
    } else {
      await sendPush(
        d,
        serious ? uniqueById(recipients.directors, recipients.stateManagers) : recipients.directors,
      );
    }
    if (serious) await sendCard(d, []);
  } else if (level === 1) {
    if (serious) {
      await sendCard(d, recipients.owners);
      await sendPush(d, recipients.owners);
    } else {
      await sendPush(d, recipients.stateManagers);
    }
  } else if (serious) {
    await sendCard(d, recipients.owners);
  }

  // A level that found nobody to tell still counts as attempted: record a
  // marker row so the sweep advances past it instead of re-dispatching the
  // same level on every run. Levels the tier doesn't have (moderate 2) are
  // not attempts.
  const sent = d.rows.length > 0;
  if (!sent) {
    if (level > ESCALATION[rules.tier].length) return false;
    d.rows.push({
      assessmentId,
      serviceId: subject.service.id,
      tier: rules.tier,
      recipientUserId: null,
      channel: "push",
      escalationLevel: level,
      delivered: false,
    });
  }
  try {
    await db.triageAlert.createMany({ data: d.rows });
  } catch (err) {
    // The alerts are already out. Fail loudly: without these rows the sweep
    // cannot see level 0 and would never escalate.
    logger.error("Knox: could not record alert rows", {
      assessmentId,
      level,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  return sent;
}

// ── Escalation sweep ─────────────────────────────────────

function asClocks(value: unknown): TriageClock[] {
  return Array.isArray(value) ? (value as TriageClock[]) : [];
}

/**
 * Escalate alerted, unacknowledged assessments. For each one the next level
 * is `highest existing level + 1`, sent once `ESCALATION[tier][highest]`
 * minutes have passed since the level-0 alert. Because it only ever creates
 * the next integer level, a repeated or overlapping run cannot double-send
 * once the first run's rows are written.
 */
export async function runEscalationSweep(
  db: PrismaClient,
  now: Date,
): Promise<{ escalated: number }> {
  const candidates = await db.triageAssessment.findMany({
    where: {
      alerted: true,
      tier: { in: ["moderate", "serious"] },
      createdAt: { gte: new Date(now.getTime() - SWEEP_LOOKBACK_MS) },
      alerts: { none: { acknowledgedAt: { not: null } } },
    },
    select: {
      id: true,
      tier: true,
      subjectType: true,
      subjectId: true,
      ruleHits: true,
      clocks: true,
      rationale: true,
      alerts: { select: { escalationLevel: true, sentAt: true, acknowledgedAt: true } },
    },
  });

  let escalated = 0;
  for (const a of candidates) {
    try {
      if (a.tier === "minor") continue;
      if (a.alerts.some((x) => x.acknowledgedAt)) continue;
      const steps = ESCALATION[a.tier];

      const current = Math.max(...a.alerts.map((x) => x.escalationLevel));
      const level0 = a.alerts.filter((x) => x.escalationLevel === 0).map((x) => x.sentAt.getTime());
      if (level0.length === 0 || current >= steps.length) continue;

      const due = Math.min(...level0) + steps[current] * MIN_MS;
      if (now.getTime() < due) continue;

      const subject = await loadSubject(db, a.subjectType, a.subjectId);
      if (!subject) {
        logger.warn("Knox: escalation skipped, subject not found", {
          assessmentId: a.id,
          subjectType: a.subjectType,
          subjectId: a.subjectId,
        });
        continue;
      }
      const recipients = await resolveRecipients(db, subject.service);
      const sent = await dispatchLevel(db, {
        assessmentId: a.id,
        subject,
        rules: { tier: a.tier, ruleHits: a.ruleHits, clocks: asClocks(a.clocks) },
        recipients,
        level: (current + 1) as Level,
        rationale: a.rationale,
      });
      if (sent) escalated++;
    } catch (err) {
      logger.error("Knox: escalation failed", {
        assessmentId: a.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { escalated };
}
