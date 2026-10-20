/**
 * AI morning briefing v1 (2026-07-05).
 *
 * Turns the dashboard from pull to push: instead of a leader opening
 * five pages to find out what needs them, a cron composes one short
 * brief per person each morning from live signals and drops it on
 * /dashboard + /my-portal with a notification.
 *
 * Design rules:
 *  - Signals are collected with plain Prisma queries — cheap, testable.
 *  - The AI call (existing ai-provider abstraction) only WRITES PROSE.
 *    It never decides what's in the brief; the signal collector does.
 *  - If the AI call fails, `composeFallback` renders the same signals
 *    as a deterministic markdown list — the cron never produces nothing.
 */

import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { generateStructured } from "@/lib/ai-provider";
import { logger } from "@/lib/logger";
import { clockLabel } from "@/lib/knox/format";
import { liveClocksFor } from "@/lib/knox/live-clocks";
import type { ClockKind } from "@/lib/knox/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Roles that receive an AI-composed brief in v1. Educators come later. */
export const BRIEFING_ROLES = [
  "owner",
  "head_office",
  "admin",
  "member",
  "marketing",
] as const;

export interface BriefingSignals {
  overdueTodos: Array<{ id: string; title: string; dueDate: string }>;
  offTrackRocks: Array<{ id: string; title: string }>;
  openIssues: Array<{ id: string; title: string }>;
  /** Admin-tier + member (service-scoped): certs expiring ≤7d for staff rostered in the next 7d. */
  expiringCertsOnRoster: Array<{
    staffName: string;
    certType: string;
    expiresInDays: number;
  }>;
  /** Admin-tier + member (service-scoped): clock-ins with no clock-out in the last 7 days. */
  incompleteClockOuts: number;
  /** Admin-tier + marketing: enquiries with no movement in 5+ days (active stages only). */
  staleEnquiries: number;
  /** Meetings scheduled today that the user attends or created. */
  meetingsToday: Array<{ id: string; title: string; prepared: boolean }>;
  /** Admin-tier only: occupancy projections needing action (computed
   *  once per cron run and passed in — see the cron). */
  forecastAlerts: Array<{ serviceName: string; kind: string; detail: string }>;
  /** Admin-tier (org-wide) + member (service-scoped): Knox incident triage. */
  knox: {
    /** Minor-tier assessments in the last 24h, per service (never pinged live). */
    minorYesterday: Array<{ serviceName: string; count: number }>;
    /** Alerted assessments nobody has acknowledged. */
    unacknowledgedAlerts: number;
    /** Knox proposals (pending action cards) still awaiting a decision. */
    openCards: number;
    /** Not-yet-overdue notification clocks falling due in the next 24h. */
    clocksDueWithin24h: Array<{
      serviceName: string;
      kind: ClockKind;
      dueAt: string;
    }>;
  };
}

function emptyKnoxSignals(): BriefingSignals["knox"] {
  return {
    minorYesterday: [],
    unacknowledgedAlerts: 0,
    openCards: 0,
    clocksDueWithin24h: [],
  };
}

export function totalSignalCount(s: BriefingSignals): number {
  return (
    s.overdueTodos.length +
    s.offTrackRocks.length +
    s.openIssues.length +
    s.expiringCertsOnRoster.length +
    (s.incompleteClockOuts > 0 ? 1 : 0) +
    (s.staleEnquiries > 0 ? 1 : 0) +
    s.meetingsToday.length +
    s.forecastAlerts.length +
    s.knox.unacknowledgedAlerts +
    s.knox.openCards +
    s.knox.clocksDueWithin24h.length
  );
}

const ACTIVE_ENQUIRY_STAGES = [
  "new_enquiry",
  "info_sent",
  "nurturing",
  "form_started",
];

const ADMIN_TIER = new Set(["owner", "head_office", "admin"]);

const CLOCK_KINDS: ReadonlySet<string> = new Set<ClockKind>([
  "parent_24h",
  "regulator",
  "complaint_regulator",
]);
const MAX_KNOX_CLOCKS = 10;

/**
 * Knox signal. `serviceId` undefined = org-wide (admin tier); otherwise
 * limited to that service (member). Callers skip other roles entirely.
 */
async function collectKnoxSignals(
  serviceId: string | undefined,
  now: Date,
): Promise<BriefingSignals["knox"]> {
  const scope = serviceId ? { serviceId } : {};
  const ago24h = new Date(now.getTime() - DAY_MS);
  const ago7d = new Date(now.getTime() - 7 * DAY_MS);
  const in24h = new Date(now.getTime() + DAY_MS);

  const [minorGroups, unacknowledgedAlerts, openCards, recent] =
    await Promise.all([
      prisma.triageAssessment.groupBy({
        by: ["serviceId"],
        where: { tier: "minor", createdAt: { gte: ago24h, lt: now }, ...scope },
        _count: { _all: true },
      }),
      prisma.triageAssessment.count({
        // Same 7-day lookback as the Knox inbox's awaiting list.
        where: {
          alerted: true,
          createdAt: { gte: ago7d },
          alerts: { none: { acknowledgedAt: { not: null } } },
          ...scope,
        },
      }),
      prisma.pendingAction.count({
        where: {
          committedAt: null,
          dismissedAt: null,
          expiresAt: { gt: now },
          ...scope,
        },
      }),
      prisma.triageAssessment.findMany({
        where: { createdAt: { gte: ago7d }, ...scope },
        select: {
          subjectType: true,
          subjectId: true,
          clocks: true,
          createdAt: true,
          service: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const nonZero = minorGroups.filter((g) => g._count._all > 0);
  let minorYesterday: BriefingSignals["knox"]["minorYesterday"] = [];
  if (nonZero.length > 0) {
    const services = await prisma.service.findMany({
      where: { id: { in: nonZero.map((g) => g.serviceId) } },
      select: { id: true, name: true },
    });
    const names = new Map(services.map((sv) => [sv.id, sv.name]));
    minorYesterday = nonZero
      .map((g) => ({
        serviceName: names.get(g.serviceId) ?? "Unknown service",
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  }

  // Newest-first, so the first row per subject is its current assessment.
  // Only records whose current assessment stored a clock can have one; their
  // clocks are then recomputed from the LIVE record, because a stored clock
  // keeps counting down after the family or regulator has been told.
  const seen = new Set<string>();
  const withClocks: typeof recent = [];
  for (const row of recent) {
    const key = `${row.subjectType}:${row.subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (Array.isArray(row.clocks) && row.clocks.length > 0) withClocks.push(row);
  }
  const live = await Promise.all(
    withClocks.map((row) => liveClocksFor(prisma, row.subjectType, row.subjectId, now)),
  );
  const clocksDueWithin24h: Array<{
    serviceName: string;
    kind: ClockKind;
    dueAt: string;
    dueMs: number;
  }> = [];
  withClocks.forEach((row, i) => {
    for (const c of live[i]) {
      if (!CLOCK_KINDS.has(c.kind) || c.overdue) continue;
      const dueMs = new Date(c.dueAt).getTime();
      if (Number.isNaN(dueMs)) continue;
      if (dueMs < now.getTime() || dueMs > in24h.getTime()) continue;
      clocksDueWithin24h.push({
        serviceName: row.service.name,
        kind: c.kind,
        dueAt: c.dueAt,
        dueMs,
      });
    }
  });
  clocksDueWithin24h.sort((a, b) => a.dueMs - b.dueMs);

  return {
    minorYesterday,
    unacknowledgedAlerts,
    openCards,
    clocksDueWithin24h: clocksDueWithin24h
      .slice(0, MAX_KNOX_CLOCKS)
      .map(({ serviceName, kind, dueAt }) => ({ serviceName, kind, dueAt })),
  };
}

const SYDNEY_DUE_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "short",
});

/** "14:30 21 Oct" in Sydney time. */
function formatDueSydney(iso: string): string {
  const parts = Object.fromEntries(
    SYDNEY_DUE_FMT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.hour}:${parts.minute} ${parts.day} ${parts.month}`;
}

export async function collectBriefingSignals(
  user: { id: string; role: string; serviceId: string | null },
  now: Date,
  orgForecastAlerts: BriefingSignals["forecastAlerts"] = [],
): Promise<BriefingSignals> {
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const in7d = new Date(now.getTime() + 7 * DAY_MS);
  const ago5d = new Date(now.getTime() - 5 * DAY_MS);
  const ago7d = new Date(now.getTime() - 7 * DAY_MS);

  const isAdminTier = ADMIN_TIER.has(user.role);
  const isMember = user.role === "member";
  const serviceScope = isMember && user.serviceId ? user.serviceId : undefined;

  const [overdueTodos, offTrackRocks, openIssues] = await Promise.all([
    prisma.todo.findMany({
      where: {
        assigneeId: user.id,
        status: { in: ["pending", "in_progress"] },
        dueDate: { lt: todayStart },
      },
      select: { id: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.rock.findMany({
      where: { ownerId: user.id, status: "off_track" },
      select: { id: true, title: true },
      take: 3,
    }),
    prisma.issue.findMany({
      where: {
        ownerId: user.id,
        status: { in: ["open", "in_discussion"] },
        category: "short_term",
      },
      select: { id: true, title: true },
      take: 3,
    }),
  ]);

  // Compliance risk with a roster behind it: someone is scheduled to
  // work in the next 7 days AND holds a cert that expires within 7.
  let expiringCertsOnRoster: BriefingSignals["expiringCertsOnRoster"] = [];
  let incompleteClockOuts = 0;
  if (isAdminTier || isMember) {
    const expiringCerts = await prisma.complianceCertificate.findMany({
      where: {
        supersededAt: null,
        userId: { not: null },
        ...(serviceScope ? { serviceId: serviceScope } : {}),
        expiryDate: { gte: todayStart, lte: in7d },
      },
      select: {
        type: true,
        expiryDate: true,
        userId: true,
        user: { select: { name: true } },
      },
      take: 50,
    });
    if (expiringCerts.length > 0) {
      const userIds = [
        ...new Set(expiringCerts.map((c) => c.userId!).filter(Boolean)),
      ];
      const rostered = await prisma.rosterShift.findMany({
        where: {
          userId: { in: userIds },
          date: { gte: todayStart, lte: in7d },
          ...(serviceScope ? { serviceId: serviceScope } : {}),
        },
        select: { userId: true },
        distinct: ["userId"],
      });
      const rosteredIds = new Set(rostered.map((r) => r.userId));
      expiringCertsOnRoster = expiringCerts
        .filter((c) => rosteredIds.has(c.userId))
        .slice(0, 5)
        .map((c) => ({
          staffName: c.user?.name ?? "Unknown",
          certType: c.type,
          expiresInDays: Math.max(
            0,
            Math.round((c.expiryDate!.getTime() - todayStart.getTime()) / DAY_MS),
          ),
        }));
    }

    incompleteClockOuts = await prisma.rosterShift.count({
      where: {
        actualStart: { not: null },
        actualEnd: null,
        date: { gte: ago7d, lt: todayStart },
        ...(serviceScope ? { serviceId: serviceScope } : {}),
      },
    });
  }

  let staleEnquiries = 0;
  if (isAdminTier || user.role === "marketing") {
    staleEnquiries = await prisma.parentEnquiry.count({
      where: {
        stage: { in: ACTIVE_ENQUIRY_STAGES },
        updatedAt: { lt: ago5d },
      },
    });
  }

  const meetingsTodayRaw = await prisma.meeting.findMany({
    where: {
      status: "scheduled",
      date: { gte: todayStart, lt: new Date(todayStart.getTime() + DAY_MS) },
      OR: [
        { createdById: user.id },
        { attendees: { some: { userId: user.id } } },
      ],
    },
    select: { id: true, title: true, aiAgendaDraft: true },
    take: 3,
  });

  // Knox: org-wide for admin tier, scoped to their centre for a member.
  // Every other role (marketing, staff…) gets the empty signal.
  let knox = emptyKnoxSignals();
  if (isAdminTier) {
    knox = await collectKnoxSignals(undefined, now);
  } else if (serviceScope) {
    knox = await collectKnoxSignals(serviceScope, now);
  }

  return {
    overdueTodos: overdueTodos.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate.toISOString().slice(0, 10),
    })),
    offTrackRocks,
    openIssues,
    expiringCertsOnRoster,
    incompleteClockOuts,
    staleEnquiries,
    meetingsToday: meetingsTodayRaw.map((m) => ({
      id: m.id,
      title: m.title,
      prepared: m.aiAgendaDraft !== null,
    })),
    forecastAlerts: ADMIN_TIER.has(user.role) ? orgForecastAlerts : [],
    knox,
  };
}

/** Deterministic markdown — used when the AI call fails AND as its input. */
export function composeFallback(signals: BriefingSignals): string {
  const lines: string[] = [];
  if (signals.meetingsToday.length > 0) {
    for (const m of signals.meetingsToday) {
      lines.push(
        `- **${m.title}** is today${m.prepared ? " — the AI agenda draft is ready" : ""}.`,
      );
    }
  }
  for (const c of signals.expiringCertsOnRoster) {
    lines.push(
      `- **${c.staffName}**'s ${c.certType.replace(/_/g, " ")} expires in ${c.expiresInDays} day${c.expiresInDays === 1 ? "" : "s"} and they're rostered this week.`,
    );
  }
  if (signals.incompleteClockOuts > 0) {
    lines.push(
      `- ${signals.incompleteClockOuts} shift${signals.incompleteClockOuts === 1 ? " is" : "s are"} missing a clock-out from the last week — payroll can't price them until fixed.`,
    );
  }
  for (const t of signals.overdueTodos) {
    lines.push(`- To-do overdue since ${t.dueDate}: **${t.title}**`);
  }
  for (const r of signals.offTrackRocks) {
    lines.push(`- Rock off track: **${r.title}**`);
  }
  for (const i of signals.openIssues) {
    lines.push(`- Open issue you own: **${i.title}**`);
  }
  if (signals.staleEnquiries > 0) {
    lines.push(
      `- ${signals.staleEnquiries} active enquir${signals.staleEnquiries === 1 ? "y has" : "ies have"} had no movement in 5+ days.`,
    );
  }
  for (const a of signals.forecastAlerts) {
    lines.push(`- **${a.serviceName}** ${a.detail}.`);
  }
  const k = signals.knox;
  if (k.unacknowledgedAlerts > 0) {
    lines.push(
      `- Knox: **${k.unacknowledgedAlerts}** alert${k.unacknowledgedAlerts === 1 ? "" : "s"} awaiting acknowledgement.`,
    );
  }
  if (k.openCards > 0) {
    lines.push(
      `- Knox: **${k.openCards}** proposed change${k.openCards === 1 ? "" : "s"} waiting for approval.`,
    );
  }
  for (const c of k.clocksDueWithin24h) {
    lines.push(
      `- Knox: **${c.serviceName}** ${clockLabel(c.kind)} due ${formatDueSydney(c.dueAt)} (Sydney).`,
    );
  }
  for (const m of k.minorYesterday) {
    lines.push(
      `- Knox: ${m.count} minor incident${m.count === 1 ? "" : "s"} at **${m.serviceName}** yesterday.`,
    );
  }
  if (lines.length === 0) {
    return "Nothing needs you this morning — all clear.";
  }
  return lines.join("\n");
}

const briefSchema = z.object({
  brief: z.string().min(1),
});

/**
 * Compose the brief. AI writes the prose from the signals; any failure
 * falls back to the deterministic rendering. Returns the markdown plus
 * which composer produced it.
 */
export async function composeBriefing(
  userName: string,
  role: string,
  signals: BriefingSignals,
): Promise<{ content: string; source: "ai" | "fallback" }> {
  const fallback = composeFallback(signals);
  if (totalSignalCount(signals) === 0) {
    return { content: fallback, source: "fallback" };
  }
  try {
    const result = await generateStructured({
      system:
        "You write a morning brief for a leader at Amana OSHC (out-of-school-hours care). " +
        'Respond as JSON: {"brief": "<markdown>"}. Rules: under 120 words; lead with the single most urgent item; ' +
        "group related items; plain Australian English; no greetings or sign-offs; keep the **bold** markers around names/titles; " +
        "never invent items that are not in the signal list.",
      prompt:
        `Reader: ${userName} (role: ${role}). Today's signals as bullet points:\n\n${fallback}\n\n` +
        "Rewrite these as a tight morning brief, ordered by urgency.",
      schema: briefSchema,
      maxTokens: 512,
      temperature: 0.3,
    });
    return { content: result.data.brief, source: "ai" };
  } catch (err) {
    logger.warn("Morning briefing AI compose failed — using fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { content: fallback, source: "fallback" };
  }
}
