/**
 * Shared board report generation logic.
 *
 * Used by:
 *  - POST /api/reports/board (manual generation)
 *  - POST /api/cowork/reports/board (Claude Cowork)
 *  - GET  /api/cron/board-report (monthly auto-generation)
 */

import { prisma } from "@/lib/prisma";

// ── Types ──────────────────────────────────────────────────

export interface BoardReportData {
  financial: {
    totalRevenue: number;
    totalCosts: number;
    grossProfit: number;
    avgMargin: number;
    revenueByService: {
      serviceName: string;
      revenue: number;
      costs: number;
      margin: number;
    }[];
    budgetVariance: number | null;
    priorMonthRevenue: number | null;
    revenueTrend: number | null;
  };
  operations: {
    avgBscOccupancy: number;
    avgAscOccupancy: number;
    occupancyByService: {
      serviceName: string;
      bsc: number;
      asc: number;
    }[];
    healthScores: {
      serviceName: string;
      overall: number;
      trend: string;
    }[];
  };
  compliance: {
    totalCerts: number;
    expiringSoon: number;
    expired: number;
    expiringList: {
      type: string;
      service: string;
      expiryDate: string;
    }[];
  };
  growth: {
    totalLeads: number;
    newThisMonth: number;
    wonThisMonth: number;
    lostThisMonth: number;
    pipelineByStage: Record<string, number>;
  };
  people: {
    activeStaff: number;
    contractBreakdown: Record<string, number>;
    qualificationSummary: Record<string, number>;
  };
  rocks: {
    quarter: string;
    total: number;
    onTrack: number;
    offTrack: number;
    complete: number;
    dropped: number;
    avgCompletion: number;
    rockList: {
      title: string;
      owner: string;
      status: string;
      percentComplete: number;
    }[];
  };
  generatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

function monthName(m: number): string {
  return new Date(2024, m - 1).toLocaleDateString("en-AU", { month: "long" });
}

// ── Main Generator ─────────────────────────────────────────

export async function generateBoardReport({
  month,
  year,
}: {
  month: number;
  year: number;
}) {
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  // Previous month for trend
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevFirstOfMonth = new Date(prevYear, prevMonth - 1, 1);
  const prevLastOfMonth = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);

  const currentQuarter = `Q${Math.ceil(month / 3)}-${year}`;

  // ── Parallel data fetching ─────────────────────────────────

  const [
    financials,
    prevFinancials,
    attendance,
    healthScores,
    allCerts,
    leads,
    activeStaffCount,
    contracts,
    qualifications,
    rocks,
  ] = await Promise.all([
    prisma.financialPeriod.findMany({
      where: { periodType: "monthly", periodStart: { gte: firstOfMonth, lte: lastOfMonth } },
      include: { service: { select: { name: true } } },
    }),
    prisma.financialPeriod.findMany({
      where: { periodType: "monthly", periodStart: { gte: prevFirstOfMonth, lte: prevLastOfMonth } },
    }),
    prisma.dailyAttendance.findMany({
      where: { date: { gte: firstOfMonth, lte: lastOfMonth } },
      include: { service: { select: { name: true } } },
    }),
    prisma.healthScore.findMany({
      where: { periodType: "monthly", periodStart: { gte: firstOfMonth, lte: lastOfMonth } },
      include: { service: { select: { name: true } } },
    }),
    // Compliance: only certs expiring within 90 days before → 30 days after month end
    prisma.complianceCertificate.findMany({
      where: {
        expiryDate: {
          gte: new Date(lastOfMonth.getTime() - 90 * 86400000),
          lte: new Date(lastOfMonth.getTime() + 30 * 86400000),
        },
      },
      include: { service: { select: { name: true } } },
      orderBy: { expiryDate: "asc" },
    }),
    // Leads: count-only queries are cheaper — but we need stage breakdown + monthly new/won/lost
    // Fetch only leads created/won/lost this month + active pipeline leads (not all historical)
    prisma.lead.findMany({
      where: {
        deleted: false,
        OR: [
          { createdAt: { gte: firstOfMonth, lte: lastOfMonth } },
          { wonAt: { gte: firstOfMonth, lte: lastOfMonth } },
          { lostAt: { gte: firstOfMonth, lte: lastOfMonth } },
          { pipelineStage: { notIn: ["won", "lost"] } },
        ],
      },
      select: { createdAt: true, wonAt: true, lostAt: true, pipelineStage: true },
    }),
    prisma.user.count({ where: { active: true, role: { in: ["staff", "member"] } } }),
    // Contracts: only need type counts
    prisma.employmentContract.groupBy({
      by: ["contractType"],
      where: { status: "active" },
      _count: { contractType: true },
    }),
    // Qualifications: only need type counts
    prisma.staffQualification.groupBy({
      by: ["type"],
      _count: { type: true },
    }),
    prisma.rock.findMany({
      where: { deleted: false, quarter: currentQuarter },
      include: { owner: { select: { name: true } } },
    }),
  ]);

  // ── Financial Performance ──────────────────────────────────

  const totalRevenue = financials.reduce((s, f) => s + f.totalRevenue, 0);
  const totalCosts = financials.reduce((s, f) => s + f.totalCosts, 0);
  const grossProfit = financials.reduce((s, f) => s + f.grossProfit, 0);
  const avgMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const revenueByService = financials.map((f) => ({
    serviceName: f.service.name,
    revenue: f.totalRevenue,
    costs: f.totalCosts,
    margin: f.totalRevenue > 0 ? (f.grossProfit / f.totalRevenue) * 100 : 0,
  }));

  const budgetRevenue = financials.reduce(
    (s, f) => (f.budgetRevenue != null ? s + f.budgetRevenue : s),
    0,
  );
  const hasBudget = financials.some((f) => f.budgetRevenue != null);
  const budgetVariance = hasBudget && budgetRevenue > 0
    ? ((totalRevenue - budgetRevenue) / budgetRevenue) * 100
    : null;

  const priorMonthRevenue = prevFinancials.length > 0
    ? prevFinancials.reduce((s, f) => s + f.totalRevenue, 0)
    : null;
  const revenueTrend = priorMonthRevenue && priorMonthRevenue > 0
    ? ((totalRevenue - priorMonthRevenue) / priorMonthRevenue) * 100
    : null;

  // ── Operations ─────────────────────────────────────────────

  const centreOcc: Record<string, { name: string; bscAtt: number; bscCap: number; ascAtt: number; ascCap: number }> = {};
  for (const rec of attendance) {
    const key = rec.serviceId;
    if (!centreOcc[key]) {
      centreOcc[key] = { name: rec.service.name, bscAtt: 0, bscCap: 0, ascAtt: 0, ascCap: 0 };
    }
    if (rec.sessionType === "bsc") {
      centreOcc[key].bscAtt += rec.attended;
      centreOcc[key].bscCap += rec.capacity;
    } else if (rec.sessionType === "asc") {
      centreOcc[key].ascAtt += rec.attended;
      centreOcc[key].ascCap += rec.capacity;
    }
  }

  const occupancyByService = Object.values(centreOcc).map((c) => ({
    serviceName: c.name,
    bsc: c.bscCap > 0 ? Math.round((c.bscAtt / c.bscCap) * 100) : 0,
    asc: c.ascCap > 0 ? Math.round((c.ascAtt / c.ascCap) * 100) : 0,
  }));

  const totalBscAtt = Object.values(centreOcc).reduce((s, c) => s + c.bscAtt, 0);
  const totalBscCap = Object.values(centreOcc).reduce((s, c) => s + c.bscCap, 0);
  const totalAscAtt = Object.values(centreOcc).reduce((s, c) => s + c.ascAtt, 0);
  const totalAscCap = Object.values(centreOcc).reduce((s, c) => s + c.ascCap, 0);
  const avgBscOccupancy = totalBscCap > 0 ? Math.round((totalBscAtt / totalBscCap) * 100) : 0;
  const avgAscOccupancy = totalAscCap > 0 ? Math.round((totalAscAtt / totalAscCap) * 100) : 0;

  const healthScoreList = healthScores.map((hs) => ({
    serviceName: hs.service.name,
    overall: hs.overallScore,
    trend: hs.trend,
  }));

  // ── Compliance ─────────────────────────────────────────────

  const now = new Date();
  const expiredCerts = allCerts.filter((c) => c.expiryDate < now);
  const expiringSoon = allCerts.filter((c) => c.expiryDate >= now);

  // Already sorted by expiryDate ASC from the query — most urgent first
  const expiringList = allCerts.slice(0, 30).map((c) => ({
    type: c.type,
    service: c.service.name,
    expiryDate: c.expiryDate.toISOString(),
  }));

  // ── Growth & Pipeline ──────────────────────────────────────

  const newThisMonth = leads.filter(
    (l) => l.createdAt >= firstOfMonth && l.createdAt <= lastOfMonth,
  ).length;
  const wonThisMonth = leads.filter(
    (l) => l.wonAt && l.wonAt >= firstOfMonth && l.wonAt <= lastOfMonth,
  ).length;
  const lostThisMonth = leads.filter(
    (l) => l.lostAt && l.lostAt >= firstOfMonth && l.lostAt <= lastOfMonth,
  ).length;

  // Pipeline stage breakdown (active pipeline leads only, not won/lost)
  const pipelineByStage: Record<string, number> = {};
  for (const lead of leads) {
    pipelineByStage[lead.pipelineStage] = (pipelineByStage[lead.pipelineStage] || 0) + 1;
  }
  const totalLeads = leads.length;

  // ── People ─────────────────────────────────────────────────

  const contractBreakdown: Record<string, number> = {};
  for (const c of contracts) {
    contractBreakdown[c.contractType] = c._count.contractType;
  }

  const qualificationSummary: Record<string, number> = {};
  for (const q of qualifications) {
    qualificationSummary[q.type] = q._count.type;
  }

  // ── Quarterly Rocks ────────────────────────────────────────

  const onTrack = rocks.filter((r) => r.status === "on_track").length;
  const offTrack = rocks.filter((r) => r.status === "off_track").length;
  const complete = rocks.filter((r) => r.status === "complete").length;
  const dropped = rocks.filter((r) => r.status === "dropped").length;
  const avgCompletion = rocks.length > 0
    ? Math.round(rocks.reduce((s, r) => s + r.percentComplete, 0) / rocks.length)
    : 0;

  const rockList = rocks.map((r) => ({
    title: r.title,
    owner: r.owner.name,
    status: r.status,
    percentComplete: r.percentComplete,
  }));

  // ── Assemble Report Data ───────────────────────────────────

  const reportData: BoardReportData = {
    financial: {
      totalRevenue,
      totalCosts,
      grossProfit,
      avgMargin,
      revenueByService,
      budgetVariance,
      priorMonthRevenue,
      revenueTrend,
    },
    operations: {
      avgBscOccupancy,
      avgAscOccupancy,
      occupancyByService,
      healthScores: healthScoreList,
    },
    compliance: {
      totalCerts: allCerts.length,
      expiringSoon: expiringSoon.length,
      expired: expiredCerts.length,
      expiringList,
    },
    growth: {
      totalLeads,
      newThisMonth,
      wonThisMonth,
      lostThisMonth,
      pipelineByStage,
    },
    people: {
      activeStaff: activeStaffCount,
      contractBreakdown,
      qualificationSummary,
    },
    rocks: {
      quarter: currentQuarter,
      total: rocks.length,
      onTrack,
      offTrack,
      complete,
      dropped,
      avgCompletion,
      rockList,
    },
    generatedAt: new Date().toISOString(),
  };

  // ── Generate Default Narratives ────────────────────────────

  const mName = monthName(month);
  const trendStr = revenueTrend != null
    ? revenueTrend >= 0
      ? `up ${fmtPct(revenueTrend)} from last month`
      : `down ${fmtPct(Math.abs(revenueTrend))} from last month`
    : "no prior month data for comparison";

  const defaultExecSummary = [
    `${mName} ${year} saw total revenue of ${fmtCurrency(totalRevenue)} with a ${fmtPct(avgMargin)} margin.`,
    `BSC occupancy averaged ${fmtPct(avgBscOccupancy)} and ASC ${fmtPct(avgAscOccupancy)} across all centres.`,
    rocks.length > 0 ? `${onTrack + complete} of ${rocks.length} quarterly rocks are on track or complete.` : "",
    expiredCerts.length > 0 ? `${expiredCerts.length} compliance certificate(s) have expired and need immediate attention.` : "All compliance certificates are current.",
  ].filter(Boolean).join(" ");

  const defaultFinancial = `Total revenue for ${mName} was ${fmtCurrency(totalRevenue)}, ${trendStr}. Total costs were ${fmtCurrency(totalCosts)}, resulting in a gross profit of ${fmtCurrency(grossProfit)}.`;

  const defaultOperations = `Average BSC occupancy was ${fmtPct(avgBscOccupancy)} and ASC was ${fmtPct(avgAscOccupancy)}. ${healthScoreList.length > 0 ? `Health scores ranged from ${Math.min(...healthScoreList.map((h) => h.overall)).toFixed(0)} to ${Math.max(...healthScoreList.map((h) => h.overall)).toFixed(0)}.` : ""}`;

  const defaultCompliance = expiredCerts.length > 0
    ? `${expiredCerts.length} certificate(s) expired and ${expiringSoon.length} expiring within 30 days.`
    : `All certificates current. ${expiringSoon.length} due for renewal within 30 days.`;

  const defaultGrowth = `Pipeline contains ${leads.length} total leads. ${newThisMonth} new lead(s) added, ${wonThisMonth} won, and ${lostThisMonth} lost this month.`;

  const totalContracts = Object.values(contractBreakdown).reduce((s, n) => s + n, 0);
  const defaultPeople = `${activeStaffCount} active staff members across all centres. ${totalContracts} active employment contracts.`;

  const defaultRocks = rocks.length > 0
    ? `${currentQuarter}: ${onTrack} on track, ${offTrack} off track, ${complete} complete, ${dropped} dropped. Average completion ${fmtPct(avgCompletion)}.`
    : `No rocks found for ${currentQuarter}.`;

  // ── Upsert Report ──────────────────────────────────────────

  // Check if a report already exists to preserve manual narrative edits
  const existing = await prisma.boardReport.findUnique({
    where: { month_year: { month, year } },
    select: {
      executiveSummary: true,
      financialNarrative: true,
      operationsNarrative: true,
      complianceNarrative: true,
      growthNarrative: true,
      peopleNarrative: true,
      rocksNarrative: true,
    },
  });

  const report = await prisma.boardReport.upsert({
    where: { month_year: { month, year } },
    update: {
      data: reportData as object,
      generatedAt: new Date(),
      // Only overwrite narratives if they are currently null (preserve manual edits)
      ...(existing?.executiveSummary == null ? { executiveSummary: defaultExecSummary } : {}),
      ...(existing?.financialNarrative == null ? { financialNarrative: defaultFinancial } : {}),
      ...(existing?.operationsNarrative == null ? { operationsNarrative: defaultOperations } : {}),
      ...(existing?.complianceNarrative == null ? { complianceNarrative: defaultCompliance } : {}),
      ...(existing?.growthNarrative == null ? { growthNarrative: defaultGrowth } : {}),
      ...(existing?.peopleNarrative == null ? { peopleNarrative: defaultPeople } : {}),
      ...(existing?.rocksNarrative == null ? { rocksNarrative: defaultRocks } : {}),
    },
    create: {
      month,
      year,
      status: "draft",
      data: reportData as object,
      executiveSummary: defaultExecSummary,
      financialNarrative: defaultFinancial,
      operationsNarrative: defaultOperations,
      complianceNarrative: defaultCompliance,
      growthNarrative: defaultGrowth,
      peopleNarrative: defaultPeople,
      rocksNarrative: defaultRocks,
    },
  });

  return report;
}
