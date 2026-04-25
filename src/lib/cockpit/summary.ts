/**
 * Marketing cockpit aggregation.
 *
 * Single source of truth for the six KPI tiles + secondary cards. Used by:
 *   - GET /api/marketing/cockpit/summary   (live UI)
 *   - /api/cron/draft-weekly-marketing-report  (frozen snapshot for the report)
 *
 * All tile queries are run in parallel via Promise.all and scoped to a supplied
 * week window + term. The function is pure with respect to time — pass the
 * reference date/term explicitly so tests and cron can freeze it.
 */

import { prisma } from "@/lib/prisma";
import { buildRagMetric, type RagMetric, type RagStatus } from "@/lib/rag-status";
import { getCurrentTerm, getNextTerm, type SchoolTerm } from "@/lib/school-terms";
import type { WeekWindow } from "@/lib/cockpit/week";
import { getWeekWindow } from "@/lib/cockpit/week";

// CTA compliance heuristic — if caption matches any of these, we consider a CTA present.
const CTA_PATTERNS = [
  /https?:\/\//i,
  /link in bio/i,
  /bit\.ly/i,
  /\/l\//i,
  /dm us/i,
  /enrol/i,
  /book/i,
  /sign up/i,
  /register/i,
];

function hasCta(caption: string | null | undefined): boolean {
  if (!caption) return false;
  return CTA_PATTERNS.some((p) => p.test(caption));
}

export type CockpitSummary = {
  weekStart: string;
  weekEnd: string;
  term: { year: number; term: number };
  weeklyReport: {
    id: string | null;
    status: "draft" | "reviewed" | "sent" | null;
    draftedAt: string | null;
    readyToSend: boolean;
  };
  priorities: string[];
  tiles: {
    brandSocial: {
      feed: RagMetric;
      stories: RagMetric;
      reels: RagMetric;
      ctaCompliance: { current: number; target: number; floor: number; status: RagStatus };
    };
    contentTeam: {
      hires: RagMetric;
      teamOutput: number;
      briefs24h: { current: number; target: number; floor: number; status: RagStatus };
      claudeThisWeek: boolean;
    };
    schoolLiaison: {
      termPlacements: RagMetric;
      perCentre: Array<{
        serviceId: string;
        serviceName: string;
        count: number;
        status: RagStatus;
      }>;
    };
    activations: {
      termActivations: RagMetric;
      recapRate: { current: number; target: number; floor: number; status: RagStatus } | null;
    };
    whatsapp: {
      coordinator: RagMetric;
      engagement: RagMetric;
      announcements: RagMetric;
      patternsFlagged: number;
    };
    centreIntel: {
      fresh: RagMetric;
      stale: Array<{ serviceId: string; serviceName: string; lastUpdatedAt: string; daysStale: number }>;
      pendingInsightsCount: number;
    };
  };
  aiDrafts: {
    total: number;
    breakdown: { posts: number; newsletters: number; campaigns: number; other: number };
  };
  vendorBriefs: {
    inFlight: number;
    slaWatch: Array<{ id: string; title: string; reason: "no_ack_48h" | "no_quote_5d"; daysOverdue: number }>;
    missingForNextTerm: number;
  };
  escalations: Array<{
    type: "school_unresponsive" | "whatsapp_2wk_pattern" | "vendor_escalated";
    serviceId?: string;
    serviceName?: string;
    context: string;
  }>;
};

export type SummaryInput = {
  week?: WeekWindow;
  /** Current term at the reference time. Defaults to term enclosing now. */
  term?: SchoolTerm;
  /** Marketing user id (Akram) for AI-drafts and Claude usage scoping. */
  marketingUserId?: string;
  /** Reference "now" — used for stale-avatar and SLA windows. Defaults to `new Date()`. */
  now?: Date;
};

export async function computeCockpitSummary(input: SummaryInput = {}): Promise<CockpitSummary> {
  const now = input.now ?? new Date();
  const week = input.week ?? getWeekWindow(now);
  const term = input.term ?? getCurrentTerm(now);

  // Marketing user — Akram. Resolve lazily if not supplied.
  const marketingUserId =
    input.marketingUserId ??
    (
      await prisma.user.findFirst({
        where: { role: "marketing" },
        select: { id: true },
      })
    )?.id ??
    null;

  const [
    posts,
    hires,
    briefTasks,
    claudeDrafts,
    schoolCommsTerm,
    services,
    activations,
    whatsappCoordPosts,
    engagementPosts,
    announcementPosts,
    centreAvatars,
    centreAvatarPendingInsights,
    aiDraftsPending,
    vendorBriefsInFlight,
    vendorBriefsAckSla,
    vendorBriefsQuoteSla,
    vendorBriefsNextTermMissing,
    vendorEscalations,
    unresponsiveSchoolComms,
    whatsappEscalations,
    priorReport,
    currentReport,
  ] = await Promise.all([
    // Brand Social: this week's posts with format
    prisma.marketingPost.findMany({
      where: {
        deleted: false,
        status: { in: ["approved", "published"] },
        scheduledDate: { gte: week.start, lte: week.end },
        platform: { in: ["facebook", "instagram"] },
      },
      select: { id: true, format: true, content: true },
    }),

    // Content Team hires
    prisma.user.count({
      where: {
        contentTeamStatus: { in: ["hired", "onboarding", "active"] },
        contentTeamRole: { not: null },
        active: true,
      },
    }),

    // Briefs approved within 24hr — last 7 days
    prisma.marketingTask.findMany({
      where: {
        deleted: false,
        status: "done",
        updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, createdAt: true, updatedAt: true },
    }),

    // Claude drafts this week from Akram
    marketingUserId
      ? prisma.aiTaskDraft.count({
          where: {
            model: { startsWith: "claude" },
            createdAt: { gte: week.start, lte: week.end },
            OR: [
              { marketingTask: { assigneeId: marketingUserId } },
              { todo: { assigneeId: marketingUserId } },
            ],
          },
        })
      : Promise.resolve(0),

    // School Liaison: term placements
    prisma.schoolComm.findMany({
      where: {
        type: "newsletter",
        status: { in: ["sent", "confirmed"] },
        OR: [
          { AND: [{ year: term.year }, { term: term.term }] },
          {
            AND: [{ year: null }, { sentAt: { gte: term.startsOn, lte: term.endsOn } }],
          },
        ],
      },
      select: { id: true, serviceId: true },
    }),

    // Services list
    prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),

    // Activations for this term — filter campaigns type event/launch with startDate in term
    prisma.campaignActivationAssignment.findMany({
      where: {
        campaign: {
          deleted: false,
          type: { in: ["event", "launch"] },
          startDate: { gte: term.startsOn, lte: term.endsOn },
        },
      },
      select: {
        id: true,
        campaignId: true,
        serviceId: true,
        status: true,
        campaign: { select: { startDate: true, endDate: true, type: true } },
      },
    }),

    // WhatsApp coordinator posts — last 7 days
    prisma.whatsAppCoordinatorPost.count({
      where: {
        posted: true,
        postedDate: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), lte: now },
      },
    }),

    // Engagement / Announcements — Akram's network posts this week
    prisma.whatsAppNetworkPost.count({
      where: {
        group: "engagement",
        postedAt: { gte: week.start, lte: week.end },
      },
    }),
    prisma.whatsAppNetworkPost.count({
      where: {
        group: "announcements",
        postedAt: { gte: week.start, lte: week.end },
      },
    }),

    // Centre avatars
    prisma.centreAvatar.findMany({
      select: { serviceId: true, lastUpdatedAt: true, service: { select: { name: true } } },
    }),

    // Pending harvested insights across all avatars
    prisma.centreAvatarInsight.count({ where: { status: "pending_review" } }),

    // AI drafts pending review, routed to Akram via parent task
    marketingUserId
      ? prisma.aiTaskDraft.findMany({
          where: {
            status: "ready",
            OR: [
              { marketingTask: { assigneeId: marketingUserId } },
              { todo: { assigneeId: marketingUserId } },
            ],
          },
          select: { id: true, todoId: true, marketingTaskId: true, coworkTodoId: true, taskType: true },
        })
      : Promise.resolve([] as Array<{ id: string; todoId: string | null; marketingTaskId: string | null; coworkTodoId: string | null; taskType: string }>),

    // Vendor briefs in flight
    prisma.vendorBrief.count({
      where: {
        status: {
          in: ["brief_sent", "awaiting_ack", "awaiting_quote", "quote_received", "approved", "ordered"],
        },
      },
    }),

    // SLA watch: no acknowledgement 48hr after brief sent
    prisma.vendorBrief.findMany({
      where: {
        acknowledgedAt: null,
        briefSentAt: { not: null, lte: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
        status: { notIn: ["cancelled", "installed", "delivered"] },
      },
      select: { id: true, title: true, briefSentAt: true },
      take: 3,
    }),

    // SLA watch: no quote within 5 business days (~= 7 calendar days)
    prisma.vendorBrief.findMany({
      where: {
        quoteReceivedAt: null,
        briefSentAt: { not: null, lte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["cancelled", "installed", "delivered"] },
      },
      select: { id: true, title: true, briefSentAt: true },
      take: 3,
    }),

    // Next-term missing briefs
    prisma.vendorBrief.count({
      where: {
        briefSentAt: null,
        targetTermStart: { gte: getNextTerm(now).startsOn, lte: getNextTerm(now).endsOn },
      },
    }),

    // Vendor escalations in last 7 days
    prisma.vendorBrief.findMany({
      where: {
        escalatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, title: true, serviceId: true, service: { select: { name: true } } },
      take: 5,
    }),

    // Unresponsive school contacts: submitted >7d ago, still not confirmed
    prisma.schoolComm.findMany({
      where: {
        status: "sent",
        sentAt: { lte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        serviceId: true,
        schoolName: true,
        sentAt: true,
        service: { select: { name: true } },
      },
      take: 5,
    }),

    // WhatsApp 2-week non-compliance pattern (aggregated in JS below)
    prisma.whatsAppCoordinatorPost.findMany({
      where: {
        postedDate: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), lte: now },
      },
      select: { serviceId: true, postedDate: true, posted: true, service: { select: { name: true } } },
    }),

    // Prior week's report (for priorities)
    prisma.weeklyMarketingReport.findFirst({
      where: {
        status: { in: ["reviewed", "sent"] },
        weekStart: { lt: week.start },
      },
      orderBy: { weekStart: "desc" },
      select: { nextWeekTop3: true },
    }),

    // Current week's report
    prisma.weeklyMarketingReport.findUnique({
      where: { weekStart: week.start },
      select: { id: true, status: true, draftedAt: true, sentAt: true },
    }),
  ]);

  // ── Brand Social tile ───────────────────────────────────────
  const feedCount = posts.filter((p) => p.format === "feed" || p.format === "carousel").length;
  const storyCount = posts.filter((p) => p.format === "story").length;
  const reelCount = posts.filter((p) => p.format === "reel").length;
  const ctaEligible = posts.filter((p) => p.format === "feed" || p.format === "reel" || p.format === "carousel");
  const ctaWithLink = ctaEligible.filter((p) => hasCta(p.content));
  const ctaRate = ctaEligible.length === 0 ? 1 : ctaWithLink.length / ctaEligible.length;

  const brandSocial = {
    feed: buildRagMetric({ current: feedCount, target: 10, floor: 6 }),
    stories: buildRagMetric({ current: storyCount, target: 35, floor: 20 }),
    reels: buildRagMetric({ current: reelCount, target: 3, floor: 1 }),
    ctaCompliance: {
      current: Number(ctaRate.toFixed(2)),
      target: 1.0,
      floor: 0.95,
      status:
        ctaRate >= 1.0 ? ("green" as const) : ctaRate >= 0.95 ? ("amber" as const) : ("red" as const),
    },
  };

  // ── Content Team tile ────────────────────────────────────────
  const DAY_MS = 86_400_000;
  const briefs24Total = briefTasks.length;
  const briefs24Under = briefTasks.filter(
    (t) => t.updatedAt.getTime() - t.createdAt.getTime() < 24 * 3_600_000,
  ).length;
  const briefs24Rate = briefs24Total === 0 ? 1 : briefs24Under / briefs24Total;

  const contentTeam = {
    hires: buildRagMetric({ current: hires, target: 3, floor: 2 }),
    teamOutput: 0, // Informational only — populated when team-created posts tracked (Sprint 8)
    briefs24h: {
      current: Number(briefs24Rate.toFixed(2)),
      target: 0.9,
      floor: 0.75,
      status:
        briefs24Rate >= 0.9 ? ("green" as const) : briefs24Rate >= 0.75 ? ("amber" as const) : ("red" as const),
    },
    claudeThisWeek: claudeDrafts > 0,
  };

  // ── School Liaison tile ──────────────────────────────────────
  const placementsPerService = new Map<string, number>();
  for (const sc of schoolCommsTerm) {
    placementsPerService.set(sc.serviceId, (placementsPerService.get(sc.serviceId) ?? 0) + 1);
  }
  const perCentreSchool = services.map((s) => {
    const count = placementsPerService.get(s.id) ?? 0;
    const status: RagStatus = count >= 2 ? "green" : count === 1 ? "amber" : "red";
    return { serviceId: s.id, serviceName: s.name, count, status };
  });
  const schoolLiaison = {
    termPlacements: buildRagMetric({ current: schoolCommsTerm.length, target: 20, floor: 15 }),
    perCentre: perCentreSchool,
  };

  // ── Activations tile ─────────────────────────────────────────
  const activationsTile = {
    termActivations: buildRagMetric({ current: activations.length, target: 20, floor: 15 }),
    recapRate: null as { current: number; target: number; floor: number; status: RagStatus } | null,
  };

  // ── WhatsApp tile ────────────────────────────────────────────
  // Network-wide coordinator target = 50 (10 centres × 5 weekdays). Floor = 35.
  // Patterns count is filled in below after escalations are computed.
  const whatsapp = {
    coordinator: buildRagMetric({ current: whatsappCoordPosts, target: 50, floor: 35 }),
    engagement: buildRagMetric({ current: engagementPosts, target: 3, floor: 2 }),
    announcements: buildRagMetric({ current: announcementPosts, target: 2, floor: 2 }),
    patternsFlagged: 0,
  };

  // ── Centre Intelligence tile ─────────────────────────────────
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const fresh = centreAvatars.filter((c) => c.lastUpdatedAt >= thirtyDaysAgo).length;
  const staleList = centreAvatars
    .filter((c) => c.lastUpdatedAt < thirtyDaysAgo)
    .map((c) => ({
      serviceId: c.serviceId,
      serviceName: c.service.name,
      lastUpdatedAt: c.lastUpdatedAt.toISOString(),
      daysStale: Math.floor((now.getTime() - c.lastUpdatedAt.getTime()) / DAY_MS),
    }))
    .sort((a, b) => b.daysStale - a.daysStale);

  const centreIntel = {
    fresh: buildRagMetric({ current: fresh, target: 10, floor: 8 }),
    stale: staleList,
    pendingInsightsCount: centreAvatarPendingInsights,
  };

  // ── AI drafts summary ────────────────────────────────────────
  const breakdown = { posts: 0, newsletters: 0, campaigns: 0, other: 0 };
  for (const d of aiDraftsPending) {
    if (d.marketingTaskId) breakdown.campaigns += 1;
    else if (d.todoId) breakdown.posts += 1;
    else breakdown.other += 1;
  }

  // ── Vendor briefs summary ────────────────────────────────────
  const slaWatch: CockpitSummary["vendorBriefs"]["slaWatch"] = [];
  for (const b of vendorBriefsAckSla) {
    if (!b.briefSentAt) continue;
    const daysOverdue = Math.floor((now.getTime() - b.briefSentAt.getTime()) / DAY_MS) - 2;
    slaWatch.push({ id: b.id, title: b.title, reason: "no_ack_48h", daysOverdue: Math.max(0, daysOverdue) });
  }
  for (const b of vendorBriefsQuoteSla) {
    if (!b.briefSentAt) continue;
    if (slaWatch.find((x) => x.id === b.id)) continue;
    const daysOverdue = Math.floor((now.getTime() - b.briefSentAt.getTime()) / DAY_MS) - 7;
    slaWatch.push({ id: b.id, title: b.title, reason: "no_quote_5d", daysOverdue: Math.max(0, daysOverdue) });
  }

  // ── Escalations strip ────────────────────────────────────────
  const escalations: CockpitSummary["escalations"] = [];
  for (const e of vendorEscalations) {
    escalations.push({
      type: "vendor_escalated",
      serviceId: e.serviceId ?? undefined,
      serviceName: e.service?.name,
      context: `Vendor brief "${e.title}" escalated`,
    });
  }
  for (const sc of unresponsiveSchoolComms) {
    if (!sc.sentAt) continue;
    const days = Math.floor((now.getTime() - sc.sentAt.getTime()) / DAY_MS);
    escalations.push({
      type: "school_unresponsive",
      serviceId: sc.serviceId,
      serviceName: sc.service.name,
      context: `${sc.schoolName ?? sc.service.name} unresponsive ${days}d`,
    });
  }

  // WhatsApp 2-week pattern: group by service, count posts this week & last week
  const oneWeekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const perServiceThisWeek = new Map<string, { name: string; count: number }>();
  const perServiceLastWeek = new Map<string, { name: string; count: number }>();
  for (const post of whatsappEscalations) {
    if (!post.posted) continue;
    const bucket = post.postedDate >= oneWeekAgo ? perServiceThisWeek : perServiceLastWeek;
    const current = bucket.get(post.serviceId);
    if (current) {
      current.count += 1;
    } else {
      bucket.set(post.serviceId, { name: post.service.name, count: 1 });
    }
  }
  // Per-coordinator floor: 4/5 weekday posts. Below for two consecutive weeks → flag.
  const COORD_WEEKLY_FLOOR = 4;
  let whatsappPatternsCount = 0;
  for (const s of services) {
    const thisWk = perServiceThisWeek.get(s.id)?.count ?? 0;
    const lastWk = perServiceLastWeek.get(s.id)?.count ?? 0;
    if (thisWk < COORD_WEEKLY_FLOOR && lastWk < COORD_WEEKLY_FLOOR) {
      escalations.push({
        type: "whatsapp_2wk_pattern",
        serviceId: s.id,
        serviceName: s.name,
        context: `${s.name} coordinator <${COORD_WEEKLY_FLOOR}/5 posts for 2 weeks`,
      });
      whatsappPatternsCount++;
    }
  }
  whatsapp.patternsFlagged = whatsappPatternsCount;

  // ── Weekly report banner state ───────────────────────────────
  const readyToSendWindow =
    now.getDay() === 1 && now.getHours() >= 0 && now.getHours() < 9;
  const weeklyReport = {
    id: currentReport?.id ?? null,
    status: (currentReport?.status ?? null) as "draft" | "reviewed" | "sent" | null,
    draftedAt: currentReport?.draftedAt?.toISOString() ?? null,
    readyToSend: Boolean(currentReport && currentReport.status === "reviewed" && readyToSendWindow),
  };

  // ── Priorities: parse prior week's top3 if JSON-array-ish, else newline-split ──
  const priorities = parsePriorities(priorReport?.nextWeekTop3 ?? null);

  return {
    weekStart: week.start.toISOString(),
    weekEnd: week.end.toISOString(),
    term: { year: term.year, term: term.term },
    weeklyReport,
    priorities,
    tiles: {
      brandSocial,
      contentTeam,
      schoolLiaison,
      activations: activationsTile,
      whatsapp,
      centreIntel,
    },
    aiDrafts: {
      total: aiDraftsPending.length,
      breakdown,
    },
    vendorBriefs: {
      inFlight: vendorBriefsInFlight,
      slaWatch,
      missingForNextTerm: vendorBriefsNextTermMissing,
    },
    escalations,
  };
}

export function parsePriorities(raw: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string").slice(0, 3);
    } catch {
      // fall through to newline split
    }
  }
  return trimmed
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}
