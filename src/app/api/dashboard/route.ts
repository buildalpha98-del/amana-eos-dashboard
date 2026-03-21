import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getStateScope } from "@/lib/service-scope";
import { getCentreScope, applyCentreFilter, buildCentreOrPersonalFilter } from "@/lib/centre-scope";
import {
  computeHealthScore,
  getScoreStatus,
  type ScoreInputMetrics,
  type ScoreInputFinancials,
  type ScoreInputEOS,
} from "@/lib/health-score";
import { getNetworkStaffingSummary } from "@/lib/staffing-analysis";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const now = new Date();
  const { serviceIds } = await getCentreScope(session);
  const stateScope = getStateScope(session);

  // Build service where clause with centre scoping
  const serviceWhere: Record<string, unknown> = {
    status: { in: ["active", "onboarding"] },
  };
  applyCentreFilter(serviceWhere, serviceIds, "id");
  if (stateScope) serviceWhere.state = stateScope;

  // ── Centre Health ──────────────────────────────────────────
  const services = await prisma.service.findMany({
    where: serviceWhere,
    include: {
      metrics: { orderBy: { recordedAt: "desc" }, take: 1 },
      financials: {
        where: { periodType: { in: ["monthly", "weekly"] } },
        orderBy: [{ periodType: "asc" }, { periodStart: "desc" }],
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

  // Ticket volume trend — tickets created per week (capped to prevent memory bloat at scale)
  const tickets = await prisma.supportTicket.findMany({
    where: { createdAt: { gte: thirteenWeeksAgo }, deleted: false },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 500,
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
          ...(serviceIds !== null ? { OR: buildCentreOrPersonalFilter(serviceIds, session!.user.id)! } : {}),
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
          ...(serviceIds !== null ? (serviceIds.length === 1 ? { serviceId: serviceIds[0] } : serviceIds.length > 1 ? { serviceId: { in: serviceIds } } : { serviceId: "__no_access__" }) : {}),
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
      assigneeName: t.assignee?.name ?? "Unknown",
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
      ownerName: r.owner?.name ?? "Unknown",
      quarter: r.quarter,
    })),
  };

  // ── Project To-Dos ───────────────────────────────────────
  const projectTodos = await prisma.todo.findMany({
    where: {
      deleted: false,
      status: { notIn: ["complete", "cancelled"] },
      projectId: { not: null },
      ...(serviceIds !== null ? { OR: buildCentreOrPersonalFilter(serviceIds, session!.user.id)! } : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      assignee: { select: { id: true, name: true } },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
          service: { select: { id: true, name: true, code: true } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
    take: 20,
  });

  const projectTodosFormatted = projectTodos.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate.toISOString(),
    assigneeName: t.assignee?.name ?? "Unknown",
    assigneeId: t.assignee?.id ?? "",
    projectId: t.project!.id,
    projectName: t.project!.name,
    projectStatus: t.project!.status,
    serviceName: t.project!.service?.name || null,
    serviceCode: t.project!.service?.code || null,
    serviceId: t.project!.service?.id || null,
    isOverdue: t.dueDate < now,
  }));

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
    // Total revenue from latest period (prefer monthly, include weekly)
    prisma.financialPeriod.findMany({
      where: { periodType: { in: ["monthly", "weekly"] } },
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
        ...(serviceIds !== null ? { OR: buildCentreOrPersonalFilter(serviceIds, session!.user.id)! } : {}),
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

  // ── Today's Operations (admin/owner only) ─────────────────
  const role = session!.user.role as string;
  const isServiceScoped = serviceIds !== null; // scoped roles: coordinator, member, staff, marketing

  const today = new Date(now.toISOString().split("T")[0] + "T00:00:00Z");

  // Run all ops queries in parallel
  const [
    todayAttendance,
    todayBookings,
    todayRoster,
    staffingSummary,
    pipelineLeads,
    weekAttendanceForRevenue,
  ] = await Promise.all([
    // Today's attendance per service per session
    prisma.dailyAttendance.findMany({
      where: { date: today },
      select: {
        serviceId: true,
        sessionType: true,
        enrolled: true,
        attended: true,
        capacity: true,
        casual: true,
      },
    }),
    // Today's booking forecasts
    prisma.bookingForecast.findMany({
      where: { date: today },
      select: {
        serviceId: true,
        sessionType: true,
        total: true,
        regular: true,
        casual: true,
        capacity: true,
      },
    }),
    // Today's roster shifts aggregated by service + session
    prisma.rosterShift.groupBy({
      by: ["serviceId", "sessionType"],
      where: { date: today },
      _count: { id: true },
    }),
    // Network staffing summary for today
    !isServiceScoped
      ? getNetworkStaffingSummary(today)
      : Promise.resolve(null),
    // Pipeline leads by stage
    !isServiceScoped
      ? prisma.lead.groupBy({
          by: ["pipelineStage"],
          where: { deleted: false, pipelineStage: { notIn: ["won", "lost"] } },
          _count: { id: true },
        })
      : Promise.resolve([]),
    // This week's attendance for revenue calculation
    (() => {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(today);
      weekStart.setUTCDate(today.getUTCDate() + mondayOffset);
      return prisma.dailyAttendance.findMany({
        where: {
          date: { gte: weekStart, lte: today },
        },
        include: {
          service: {
            select: {
              bscDailyRate: true,
              ascDailyRate: true,
              bscCasualRate: true,
              ascCasualRate: true,
            },
          },
        },
      });
    })(),
  ]);

  // Build per-centre ops snapshots
  const todaysOps = services.map((s) => {
    const sAttendance = todayAttendance.filter((a) => a.serviceId === s.id);
    const sBookings = todayBookings.filter((b) => b.serviceId === s.id);
    const sRoster = todayRoster.filter((r) => r.serviceId === s.id);
    const m = s.metrics[0] ?? null;

    const bscAtt = sAttendance.find((a) => a.sessionType === "bsc");
    const ascAtt = sAttendance.find((a) => a.sessionType === "asc");
    const bscBook = sBookings.find((b) => b.sessionType === "bsc");
    const ascBook = sBookings.find((b) => b.sessionType === "asc");
    const bscRoster = sRoster.find((r) => r.sessionType === "bsc");
    const ascRoster = sRoster.find((r) => r.sessionType === "asc");

    const bscAttended = bscAtt?.attended ?? 0;
    const bscEnrolled = bscAtt?.enrolled ?? bscBook?.total ?? 0;
    const ascAttended = ascAtt?.attended ?? 0;
    const ascEnrolled = ascAtt?.enrolled ?? ascBook?.total ?? 0;
    const educatorsRostered =
      (bscRoster?._count?.id ?? 0) + (ascRoster?._count?.id ?? 0);

    // Ratio status: check children per educator vs 15
    const totalChildren = bscAttended + ascAttended;
    const ratioOk = educatorsRostered > 0
      ? totalChildren / educatorsRostered <= 15
      : totalChildren === 0;

    // Status: green/amber/red based on multiple factors
    let opsStatus: "green" | "amber" | "red" = "green";
    if (!ratioOk) opsStatus = "red";
    else if (
      (bscEnrolled > 0 && bscAttended < bscEnrolled * 0.7) ||
      (ascEnrolled > 0 && ascAttended < ascEnrolled * 0.7)
    ) {
      opsStatus = "amber";
    }

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      bscAttended,
      bscEnrolled,
      ascAttended,
      ascEnrolled,
      educatorsRostered,
      ratioOk,
      incidentsToday: m?.incidentCount ?? 0,
      opsStatus,
    };
  });

  // Enrolment pipeline counts
  const enrolmentPipeline = (pipelineLeads as { pipelineStage: string; _count: { id: number } }[]).map((g) => ({
    stage: g.pipelineStage,
    count: g._count.id,
  }));
  const pipelineTotal = enrolmentPipeline.reduce((s, p) => s + p.count, 0);

  // Weekly revenue running total from attendance × rates
  let weeklyRevenueRunning = 0;
  for (const att of weekAttendanceForRevenue) {
    const svc = att.service;
    if (att.sessionType === "bsc") {
      const regularRev = (att.attended - att.casual) * (svc.bscDailyRate ?? 0);
      const casualRev = att.casual * (svc.bscCasualRate ?? 0);
      weeklyRevenueRunning += regularRev + casualRev;
    } else if (att.sessionType === "asc") {
      const regularRev = (att.attended - att.casual) * (svc.ascDailyRate ?? 0);
      const casualRev = att.casual * (svc.ascCasualRate ?? 0);
      weeklyRevenueRunning += regularRev + casualRev;
    }
  }

  // NPS Survey data (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const npsSurveyStats = await prisma.npsSurveyResponse.groupBy({
    by: ["category"],
    _count: true,
    where: {
      respondedAt: { gte: thirtyDaysAgo },
      ...(serviceIds !== null ? (serviceIds.length === 1 ? { serviceId: serviceIds[0] } : serviceIds.length > 1 ? { serviceId: { in: serviceIds } } : { serviceId: "__no_access__" }) : {}),
    },
  });

  const promoters = npsSurveyStats.find(s => s.category === "promoter")?._count || 0;
  const passives = npsSurveyStats.find(s => s.category === "passive")?._count || 0;
  const detractors = npsSurveyStats.find(s => s.category === "detractor")?._count || 0;
  const totalNps = promoters + passives + detractors;
  const npsScore = totalNps > 0 ? Math.round(((promoters - detractors) / totalNps) * 100) : null;

  // Compliance score — network average from latest metrics
  const complianceScores = services
    .map((s) => s.metrics[0]?.overallCompliance)
    .filter((c): c is number => c != null);
  const networkComplianceScore =
    complianceScores.length > 0
      ? Math.round(
          complianceScores.reduce((s, c) => s + c, 0) / complianceScores.length,
        )
      : 0;

  // Today's total attendance
  const todayTotalAttended = todayAttendance.reduce((s, a) => s + a.attended, 0);
  const todayTotalEnrolled = todayAttendance.reduce((s, a) => s + a.enrolled, 0);

  // Staffing alert counts
  const staffingAlertCount = staffingSummary
    ? staffingSummary.overstaffedCount + staffingSummary.understaffedCount
    : 0;

  return NextResponse.json({
    centreHealth: isServiceScoped
      ? centreHealth.map((c) => ({ ...c, metrics: { ...c.metrics, margin: 0 } }))
      : centreHealth,
    networkAvgScore,
    trends: isServiceScoped
      ? { ...trends, revenue: [] }
      : trends,
    actionItems: isServiceScoped
      ? { ...actionItems, unassignedTickets: [], overdueRocks: [] }
      : actionItems,
    keyMetrics: isServiceScoped
      ? { ...keyMetrics, totalRevenue: 0, openTickets: 0 }
      : keyMetrics,
    projectTodos: projectTodosFormatted,
    npsSurvey: {
      promoters,
      passives,
      detractors,
      score: npsScore,
      totalResponses: totalNps,
    },
    // New operational data (admin/owner only)
    todaysOps: isServiceScoped ? [] : todaysOps,
    opsMetrics: isServiceScoped
      ? null
      : {
          todayAttended: todayTotalAttended,
          todayExpected: todayTotalEnrolled,
          staffingAlerts: staffingAlertCount,
          complianceScore: networkComplianceScore,
          weeklyRevenue: weeklyRevenueRunning,
          pipelineLeads: pipelineTotal,
          enrolmentPipeline,
        },
  });
}
