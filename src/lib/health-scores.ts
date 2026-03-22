import { prisma } from "@/lib/prisma";
import {
  computeHealthScore,
  type ScoreInputMetrics,
  type ScoreInputFinancials,
  type ScoreInputEOS,
  PILLAR_KEYS,
} from "@/lib/health-score";
import { generateRecommendations } from "@/lib/health-score-recommendations";

// ── Types ───────────────────────────────────────────────────

interface PillarData {
  score: number;
  breakdown: Record<string, number>;
}

interface CurrentScore {
  overallScore: number;
  trend: "improving" | "declining" | "stable";
  status: string;
  pillars: {
    financial: PillarData;
    operational: PillarData;
    compliance: PillarData;
    satisfaction: PillarData;
    teamCulture: PillarData;
  };
}

export interface HealthScoreResponse {
  current: CurrentScore;
  history: {
    periodStart: Date;
    overallScore: number;
    trend: string;
    pillars: {
      financial: number;
      operational: number;
      compliance: number;
      satisfaction: number;
      teamCulture: number;
    };
  }[];
  recommendations: ReturnType<typeof generateRecommendations>;
  networkComparison: {
    centreScore: number;
    networkAvg: number;
    rank: number;
    totalCentres: number;
    pillarComparison: Record<string, { centre: number; networkAvg: number }>;
  };
}

// ── Helper: gather data and compute a score on-the-fly ──────

async function computeOnTheFly(serviceId: string) {
  const now = new Date();
  const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    latestMetrics,
    latestFinancials,
    rocksTotal,
    rocksOnTrack,
    rocksComplete,
    todosOverdue,
    openIssues,
    ticketsTotal,
    ticketsResolved,
    previousHealthScore,
  ] = await Promise.all([
    prisma.centreMetrics.findFirst({
      where: { serviceId },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.financialPeriod.findFirst({
      where: { serviceId, periodType: "monthly" },
      orderBy: { periodStart: "desc" },
    }).then(async (monthly) => {
      if (monthly) return monthly;
      return prisma.financialPeriod.findFirst({
        where: { serviceId, periodType: "weekly" },
        orderBy: { periodStart: "desc" },
      });
    }),
    prisma.rock.count({
      where: { serviceId, deleted: false, quarter: currentQuarter },
    }),
    prisma.rock.count({
      where: {
        serviceId,
        deleted: false,
        quarter: currentQuarter,
        status: "on_track",
      },
    }),
    prisma.rock.count({
      where: {
        serviceId,
        deleted: false,
        quarter: currentQuarter,
        status: "complete",
      },
    }),
    prisma.todo.count({
      where: {
        serviceId,
        deleted: false,
        status: { notIn: ["complete", "cancelled"] },
        dueDate: { lt: now },
      },
    }),
    prisma.issue.count({
      where: {
        serviceId,
        deleted: false,
        status: { in: ["open", "in_discussion"] },
      },
    }),
    prisma.supportTicket.count({
      where: {
        serviceId,
        deleted: false,
        createdAt: { gte: ninetyDaysAgo },
      },
    }),
    prisma.supportTicket.count({
      where: {
        serviceId,
        deleted: false,
        createdAt: { gte: ninetyDaysAgo },
        status: "resolved",
      },
    }),
    prisma.healthScore.findFirst({
      where: {
        serviceId,
        periodType: "monthly",
        periodStart: { lt: periodStart },
      },
      orderBy: { periodStart: "desc" },
    }),
  ]);

  const metrics: ScoreInputMetrics | null = latestMetrics
    ? {
        bscOccupancy: latestMetrics.bscOccupancy,
        ascOccupancy: latestMetrics.ascOccupancy,
        ratioCompliance: latestMetrics.ratioCompliance,
        overallCompliance: latestMetrics.overallCompliance,
        wwccCompliance: latestMetrics.wwccCompliance,
        firstAidCompliance: latestMetrics.firstAidCompliance,
        parentNps: latestMetrics.parentNps,
        incidentCount: latestMetrics.incidentCount,
        complaintCount: latestMetrics.complaintCount,
        educatorsTurnover: latestMetrics.educatorsTurnover,
        nqsRating: latestMetrics.nqsRating,
      }
    : null;

  const financials: ScoreInputFinancials | null = latestFinancials
    ? {
        margin: latestFinancials.margin,
        totalRevenue: latestFinancials.totalRevenue,
        budgetRevenue: latestFinancials.budgetRevenue,
        bscEnrolments: latestFinancials.bscEnrolments,
        ascEnrolments: latestFinancials.ascEnrolments,
      }
    : null;

  const eos: ScoreInputEOS = {
    rocksTotal,
    rocksOnTrack,
    rocksComplete,
    todosOverdue,
    openIssues,
    ticketsTotal,
    ticketsResolved,
  };

  const previousScore = previousHealthScore?.overallScore ?? null;
  const result = computeHealthScore(metrics, financials, eos, previousScore);

  return { result, metrics, financials, eos };
}

// ── Helper: convert a persisted HealthScore row to result ───

function persistedToResult(hs: {
  overallScore: number;
  trend: string;
  financialScore: number;
  operationalScore: number;
  complianceScore: number;
  satisfactionScore: number;
  teamCultureScore: number;
  financialBreakdown: unknown;
  operationalBreakdown: unknown;
  complianceBreakdown: unknown;
  satisfactionBreakdown: unknown;
  teamCultureBreakdown: unknown;
}): CurrentScore {
  const status =
    hs.overallScore >= 75 ? "green" : hs.overallScore >= 50 ? "amber" : "red";

  return {
    overallScore: hs.overallScore,
    trend: hs.trend as "improving" | "declining" | "stable",
    status,
    pillars: {
      financial: {
        score: hs.financialScore,
        breakdown: (hs.financialBreakdown as Record<string, number>) ?? {},
      },
      operational: {
        score: hs.operationalScore,
        breakdown: (hs.operationalBreakdown as Record<string, number>) ?? {},
      },
      compliance: {
        score: hs.complianceScore,
        breakdown: (hs.complianceBreakdown as Record<string, number>) ?? {},
      },
      satisfaction: {
        score: hs.satisfactionScore,
        breakdown: (hs.satisfactionBreakdown as Record<string, number>) ?? {},
      },
      teamCulture: {
        score: hs.teamCultureScore,
        breakdown: (hs.teamCultureBreakdown as Record<string, number>) ?? {},
      },
    },
  };
}

// ── Main function: fetch health score data for a service ────

export async function getHealthScoreData(serviceId: string): Promise<HealthScoreResponse> {
  // ── 1. Current score ────────────────────────────────────
  const latestPersisted = await prisma.healthScore.findFirst({
    where: { serviceId },
    orderBy: { computedAt: "desc" },
  });

  let current: CurrentScore;
  let metrics: ScoreInputMetrics | null = null;
  let financials: ScoreInputFinancials | null = null;
  let eos: ScoreInputEOS | null = null;

  if (latestPersisted) {
    current = persistedToResult(latestPersisted);

    // Still need raw inputs for recommendations
    const live = await computeOnTheFly(serviceId);
    metrics = live.metrics;
    financials = live.financials;
    eos = live.eos;
  } else {
    // No persisted score — compute everything on-the-fly
    const live = await computeOnTheFly(serviceId);
    current = {
      overallScore: live.result.overallScore,
      trend: live.result.trend,
      status: live.result.status,
      pillars: live.result.pillars,
    };
    metrics = live.metrics;
    financials = live.financials;
    eos = live.eos;
  }

  // ── 2. History (last 6 months) ──────────────────────────
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const historyRecords = await prisma.healthScore.findMany({
    where: {
      serviceId,
      periodStart: { gte: sixMonthsAgo },
    },
    orderBy: { periodStart: "asc" },
  });

  const history = historyRecords.map((hs) => ({
    periodStart: hs.periodStart,
    overallScore: hs.overallScore,
    trend: hs.trend,
    pillars: {
      financial: hs.financialScore,
      operational: hs.operationalScore,
      compliance: hs.complianceScore,
      satisfaction: hs.satisfactionScore,
      teamCulture: hs.teamCultureScore,
    },
  }));

  // ── 3. Network comparison ───────────────────────────────
  const allServices = await prisma.service.findMany({
    where: { status: { in: ["active", "onboarding"] } },
    select: { id: true },
  });

  const latestScores = await Promise.all(
    allServices.map((s) =>
      prisma.healthScore.findFirst({
        where: { serviceId: s.id },
        orderBy: { computedAt: "desc" },
      })
    )
  );

  const validScores = latestScores.filter(
    (s): s is NonNullable<typeof s> => s !== null
  );

  const totalCentres = validScores.length;

  const pillarSums: Record<string, number> = {
    financial: 0,
    operational: 0,
    compliance: 0,
    satisfaction: 0,
    teamCulture: 0,
  };
  let overallSum = 0;

  for (const s of validScores) {
    overallSum += s.overallScore;
    pillarSums.financial += s.financialScore;
    pillarSums.operational += s.operationalScore;
    pillarSums.compliance += s.complianceScore;
    pillarSums.satisfaction += s.satisfactionScore;
    pillarSums.teamCulture += s.teamCultureScore;
  }

  const networkAvg =
    totalCentres > 0 ? Math.round(overallSum / totalCentres) : 0;

  // Rank (1-based, descending by score)
  const sortedOverall = validScores
    .map((s) => s.overallScore)
    .sort((a, b) => b - a);
  const rank =
    sortedOverall.indexOf(current.overallScore) !== -1
      ? sortedOverall.indexOf(current.overallScore) + 1
      : totalCentres;

  const pillarComparison: Record<
    string,
    { centre: number; networkAvg: number }
  > = {};
  for (const key of PILLAR_KEYS) {
    const centreVal =
      current.pillars[key as keyof typeof current.pillars]?.score ?? 0;
    const avg =
      totalCentres > 0
        ? Math.round(pillarSums[key] / totalCentres)
        : 0;
    pillarComparison[key] = { centre: centreVal, networkAvg: avg };
  }

  // ── 4. Recommendations ──────────────────────────────────
  const scoreResult = {
    overallScore: current.overallScore,
    trend: current.trend as "improving" | "declining" | "stable",
    status: current.status as "green" | "amber" | "red",
    pillars: {
      financial: {
        score: current.pillars.financial.score,
        breakdown: current.pillars.financial.breakdown,
      },
      operational: {
        score: current.pillars.operational.score,
        breakdown: current.pillars.operational.breakdown,
      },
      compliance: {
        score: current.pillars.compliance.score,
        breakdown: current.pillars.compliance.breakdown,
      },
      satisfaction: {
        score: current.pillars.satisfaction.score,
        breakdown: current.pillars.satisfaction.breakdown,
      },
      teamCulture: {
        score: current.pillars.teamCulture.score,
        breakdown: current.pillars.teamCulture.breakdown,
      },
    },
  };

  const recommendations = generateRecommendations(
    scoreResult,
    metrics,
    financials,
    eos ?? {
      rocksTotal: 0,
      rocksOnTrack: 0,
      rocksComplete: 0,
      todosOverdue: 0,
      openIssues: 0,
      ticketsTotal: 0,
      ticketsResolved: 0,
    }
  );

  // ── 5. Build response ──────────────────────────────────
  return {
    current: {
      overallScore: current.overallScore,
      trend: current.trend,
      status: current.status,
      pillars: {
        financial: {
          score: current.pillars.financial.score,
          breakdown: current.pillars.financial.breakdown,
        },
        operational: {
          score: current.pillars.operational.score,
          breakdown: current.pillars.operational.breakdown,
        },
        compliance: {
          score: current.pillars.compliance.score,
          breakdown: current.pillars.compliance.breakdown,
        },
        satisfaction: {
          score: current.pillars.satisfaction.score,
          breakdown: current.pillars.satisfaction.breakdown,
        },
        teamCulture: {
          score: current.pillars.teamCulture.score,
          breakdown: current.pillars.teamCulture.breakdown,
        },
      },
    },
    history,
    recommendations,
    networkComparison: {
      centreScore: current.overallScore,
      networkAvg,
      rank,
      totalCentres,
      pillarComparison,
    },
  };
}
