import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import {
  computeHealthScore,
  getScoreStatus,
  type ScoreInputMetrics,
  type ScoreInputFinancials,
  type ScoreInputEOS,
} from "@/lib/health-score";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const now = new Date();

  // ── Centre Health ──────────────────────────────────────────
  const services = await prisma.service.findMany({
    where: { status: { in: ["active", "onboarding"] } },
    include: {
      metrics: { orderBy: { recordedAt: "desc" }, take: 1 },
      financials: {
        where: { periodType: "monthly" },
        orderBy: { periodStart: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  // Query latest persisted HealthScore per service (monthly)
  const persistedScores = await prisma.healthScore.findMany({
    where: { periodType: "monthly" },
    orderBy: { periodStart: "desc" },
    distinct: ["serviceId"],
  });

  const scoreMap = new Map(
    persistedScores.map((hs) => [hs.serviceId, hs])
  );

  const centreHealth = services.map((s) => {
    const m = s.metrics[0] ?? null;
    const f = s.financials[0] ?? null;
    const persisted = scoreMap.get(s.id);

    let score: number;
    let status: "green" | "amber" | "red";
    let trend: "improving" | "declining" | "stable";
    let pillars: {
      financial: number;
      operational: number;
      compliance: number;
      satisfaction: number;
      teamCulture: number;
    };

    if (persisted) {
      // Use persisted health score
      score = Math.round(persisted.overallScore);
      status = getScoreStatus(score);
      trend = persisted.trend as "improving" | "declining" | "stable";
      pillars = {
        financial: Math.round(persisted.financialScore),
        operational: Math.round(persisted.operationalScore),
        compliance: Math.round(persisted.complianceScore),
        satisfaction: Math.round(persisted.satisfactionScore),
        teamCulture: Math.round(persisted.teamCultureScore),
      };
    } else {
      // Fallback: compute on-the-fly with metrics + financials, empty EOS
      const metricsInput: ScoreInputMetrics | null = m
        ? {
            bscOccupancy: m.bscOccupancy,
            ascOccupancy: m.ascOccupancy,
            ratioCompliance: m.ratioCompliance,
            overallCompliance: m.overallCompliance,
            wwccCompliance: m.wwccCompliance,
            firstAidCompliance: m.firstAidCompliance,
            parentNps: m.parentNps,
            incidentCount: m.incidentCount,
            complaintCount: m.complaintCount,
            educatorsTurnover: m.educatorsTurnover,
            nqsRating: m.nqsRating,
          }
        : null;

      const financialsInput: ScoreInputFinancials | null = f
        ? {
            margin: f.margin,
            totalRevenue: f.totalRevenue,
            budgetRevenue: f.budgetRevenue,
            bscEnrolments: f.bscEnrolments,
            ascEnrolments: f.ascEnrolments,
          }
        : null;

      const emptyEOS: ScoreInputEOS = {
        rocksTotal: 0,
        rocksOnTrack: 0,
        rocksComplete: 0,
        todosOverdue: 0,
        openIssues: 0,
        ticketsTotal: 0,
        ticketsResolved: 0,
      };

      const result = computeHealthScore(metricsInput, financialsInput, emptyEOS, null);
      score = result.overallScore;
      status = result.status;
      trend = "stable";
      pillars = {
        financial: result.pillars.financial.score,
        operational: result.pillars.operational.score,
        compliance: result.pillars.compliance.score,
        satisfaction: result.pillars.satisfaction.score,
        teamCulture: result.pillars.teamCulture.score,
      };
    }

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      state: s.state,
      score,
      status,
      trend,
      pillars,
      metrics: {
        occupancy: m ? Math.round((m.bscOccupancy + m.ascOccupancy) / 2) : 0,
        compliance: m ? Math.round(m.overallCompliance) : 0,
        nps: m?.parentNps ?? 0,
        margin: f ? Math.round(f.margin) : 0,
      },
    };
  });

  // Network average score
  const networkAvgScore =
    centreHealth.length > 0
      ? Math.round(
          centreHealth.reduce((sum, c) => sum + c.score, 0) / centreHealth.length
        )
      : 0;

  // ── Trends (trailing 13 weeks) ────────────────────────────
  const thirteenWeeksAgo = new Date(now);
  thirteenWeeksAgo.setDate(thirteenWeeksAgo.getDate() - 91);

  // Revenue trend — aggregate weekly financial periods
  const weeklyFinancials = await prisma.financialPeriod.findMany({
    where: {
      periodType: "weekly",
      periodStart: { gte: thirteenWeeksAgo },
    },
    orderBy: { periodStart: "asc" },
  });

  // Group by week
  const revenueByWeek = new Map<string, number>();
  const enrolmentsByWeek = new Map<string, number>();
  for (const f of weeklyFinancials) {
    const week = f.periodStart.toISOString().split("T")[0];
    revenueByWeek.set(week, (revenueByWeek.get(week) ?? 0) + f.totalRevenue);
    enrolmentsByWeek.set(
      week,
      (enrolmentsByWeek.get(week) ?? 0) + f.bscEnrolments + f.ascEnrolments
    );
  }

  // Ticket volume trend — tickets created per week
  const tickets = await prisma.supportTicket.findMany({
    where: { createdAt: { gte: thirteenWeeksAgo }, deleted: false },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const ticketsByWeek = new Map<string, number>();
  for (const t of tickets) {
    // Get Monday of the week
    const d = new Date(t.createdAt);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const week = d.toISOString().split("T")[0];
    ticketsByWeek.set(week, (ticketsByWeek.get(week) ?? 0) + 1);
  }

  const trends = {
    revenue: Array.from(revenueByWeek.entries()).map(([week, value]) => ({
      week,
      value,
    })),
    enrolments: Array.from(enrolmentsByWeek.entries()).map(([week, value]) => ({
      week,
      value,
    })),
    tickets: Array.from(ticketsByWeek.entries()).map(([week, value]) => ({
      week,
      value,
    })),
  };

  // ── Action Items ──────────────────────────────────────────
  const [overdueTodos, unassignedTickets, idsIssues, overdueRocks] =
    await Promise.all([
      // Overdue To-Dos
      prisma.todo.findMany({
        where: {
          deleted: false,
          status: { notIn: ["complete", "cancelled"] },
          dueDate: { lt: now },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          assignee: { select: { name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      // Unassigned Tickets
      prisma.supportTicket.findMany({
        where: {
          deleted: false,
          assignedToId: null,
          status: { in: ["new", "open"] },
        },
        select: { id: true, ticketNumber: true, subject: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // IDS Issues (open, in_discussion)
      prisma.issue.findMany({
        where: {
          deleted: false,
          status: { in: ["open", "in_discussion"] },
          priority: { in: ["critical", "high"] },
        },
        select: { id: true, title: true, priority: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // Overdue Rocks (not current quarter, still active)
      prisma.rock.findMany({
        where: {
          deleted: false,
          status: { in: ["on_track", "off_track"] },
          // Rocks from previous quarters that aren't completed
          quarter: {
            not: `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`,
          },
        },
        select: {
          id: true,
          title: true,
          quarter: true,
          owner: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
    ]);

  const actionItems = {
    overdueTodos: overdueTodos.map((t) => ({
      id: t.id,
      title: t.title,
      assigneeName: t.assignee.name,
      dueDate: t.dueDate.toISOString(),
    })),
    unassignedTickets: unassignedTickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject ?? "No subject",
    })),
    idsIssues: idsIssues.map((i) => ({
      id: i.id,
      title: i.title,
      priority: i.priority,
    })),
    overdueRocks: overdueRocks.map((r) => ({
      id: r.id,
      title: r.title,
      ownerName: r.owner.name,
      quarter: r.quarter,
    })),
  };

  // ── Key Metrics ───────────────────────────────────────────
  const [
    latestFinancials,
    avgOccupancyResult,
    npsResult,
    openTicketCount,
    activeCentreCount,
    rocksOnTrackCount,
    overdueCount,
  ] = await Promise.all([
    // Total revenue from latest monthly period
    prisma.financialPeriod.findMany({
      where: { periodType: "monthly" },
      orderBy: { periodStart: "desc" },
      take: 50,
    }),
    // Avg occupancy from latest metrics
    prisma.centreMetrics.findMany({
      orderBy: { recordedAt: "desc" },
      take: 50,
      select: { serviceId: true, ascOccupancy: true, bscOccupancy: true, recordedAt: true },
    }),
    // Average NPS
    prisma.centreMetrics.findMany({
      where: { parentNps: { not: null } },
      orderBy: { recordedAt: "desc" },
      take: 50,
      select: { serviceId: true, parentNps: true, recordedAt: true },
    }),
    // Open tickets
    prisma.supportTicket.count({
      where: { deleted: false, status: { in: ["new", "open", "pending_parent"] } },
    }),
    // Active centres
    prisma.service.count({ where: { status: "active" } }),
    // Rocks on track
    prisma.rock.count({
      where: {
        deleted: false,
        status: "on_track",
        quarter: `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`,
      },
    }),
    // Overdue todos count
    prisma.todo.count({
      where: {
        deleted: false,
        status: { notIn: ["complete", "cancelled"] },
        dueDate: { lt: now },
      },
    }),
  ]);

  // Get latest period's total revenue
  const latestPeriodStart =
    latestFinancials.length > 0 ? latestFinancials[0].periodStart : null;
  const latestMonthFinancials = latestPeriodStart
    ? latestFinancials.filter(
        (f) => f.periodStart.getTime() === latestPeriodStart.getTime()
      )
    : [];
  const totalRevenue = latestMonthFinancials.reduce(
    (sum, f) => sum + f.totalRevenue,
    0
  );

  // Deduplicate metrics per service (latest only)
  const seenOccupancy = new Set<string>();
  let occTotal = 0;
  let occCount = 0;
  for (const m of avgOccupancyResult) {
    if (!seenOccupancy.has(m.serviceId)) {
      seenOccupancy.add(m.serviceId);
      occTotal += (m.ascOccupancy + m.bscOccupancy) / 2;
      occCount++;
    }
  }
  const avgOccupancy = occCount > 0 ? Math.round(occTotal / occCount) : 0;

  const seenNps = new Set<string>();
  let npsTotal = 0;
  let npsCount = 0;
  for (const m of npsResult) {
    if (!seenNps.has(m.serviceId) && m.parentNps !== null) {
      seenNps.add(m.serviceId);
      npsTotal += m.parentNps;
      npsCount++;
    }
  }
  const overallNps = npsCount > 0 ? Math.round(npsTotal / npsCount) : 0;

  const keyMetrics = {
    totalRevenue,
    avgOccupancy,
    overallNps,
    openTickets: openTicketCount,
    activeCentres: activeCentreCount,
    rocksOnTrack: rocksOnTrackCount,
    todosOverdue: overdueCount,
  };

  return NextResponse.json({
    centreHealth,
    networkAvgScore,
    trends,
    actionItems,
    keyMetrics,
  });
}
