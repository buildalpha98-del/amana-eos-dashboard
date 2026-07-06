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
    s.forecastAlerts.length
  );
}

const ACTIVE_ENQUIRY_STAGES = [
  "new_enquiry",
  "info_sent",
  "nurturing",
  "form_started",
];

const ADMIN_TIER = new Set(["owner", "head_office", "admin"]);

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
