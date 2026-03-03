import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import {
  computeHealthScore,
  getScoreStatus,
  type ScoreInputMetrics,
  type ScoreInputFinancials,
  type ScoreInputEOS,
} from "@/lib/health-score";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  // Get all active services with their latest metrics and financials
  const services = await prisma.service.findMany({
    where: { status: { in: ["active", "onboarding"] } },
    include: {
      manager: { select: { id: true, name: true } },
      metrics: {
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
      financials: {
        where: { periodType: "monthly" },
        orderBy: { periodStart: "desc" },
        take: 1,
      },
      _count: {
        select: {
          todos: { where: { deleted: false, status: { not: "complete" } } },
          issues: { where: { deleted: false, status: { in: ["open", "in_discussion"] } } },
          projects: { where: { deleted: false, status: "in_progress" } },
        },
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

  // Build performance data for each centre
  const performance = services.map((s) => {
    const metric = s.metrics[0] || null;
    const financial = s.financials[0] || null;
    const persisted = scoreMap.get(s.id);

    let score: number;
    let trend: "improving" | "declining" | "stable";
    let pillars: {
      financial: number;
      operational: number;
      compliance: number;
      satisfaction: number;
      teamCulture: number;
    };
    let pillarBreakdowns: {
      financial: Record<string, number>;
      operational: Record<string, number>;
      compliance: Record<string, number>;
      satisfaction: Record<string, number>;
      teamCulture: Record<string, number>;
    };

    if (persisted) {
      // Use persisted health score
      score = Math.round(persisted.overallScore);
      trend = persisted.trend as "improving" | "declining" | "stable";
      pillars = {
        financial: Math.round(persisted.financialScore),
        operational: Math.round(persisted.operationalScore),
        compliance: Math.round(persisted.complianceScore),
        satisfaction: Math.round(persisted.satisfactionScore),
        teamCulture: Math.round(persisted.teamCultureScore),
      };
      pillarBreakdowns = {
        financial: (persisted.financialBreakdown as Record<string, number>) ?? {},
        operational: (persisted.operationalBreakdown as Record<string, number>) ?? {},
        compliance: (persisted.complianceBreakdown as Record<string, number>) ?? {},
        satisfaction: (persisted.satisfactionBreakdown as Record<string, number>) ?? {},
        teamCulture: (persisted.teamCultureBreakdown as Record<string, number>) ?? {},
      };
    } else {
      // Fallback: compute on-the-fly with metrics + financials, empty EOS
      const metricsInput: ScoreInputMetrics | null = metric
        ? {
            bscOccupancy: metric.bscOccupancy,
            ascOccupancy: metric.ascOccupancy,
            ratioCompliance: metric.ratioCompliance,
            overallCompliance: metric.overallCompliance,
            wwccCompliance: metric.wwccCompliance,
            firstAidCompliance: metric.firstAidCompliance,
            parentNps: metric.parentNps,
            incidentCount: metric.incidentCount,
            complaintCount: metric.complaintCount,
            educatorsTurnover: metric.educatorsTurnover,
            nqsRating: metric.nqsRating,
          }
        : null;

      const financialsInput: ScoreInputFinancials | null = financial
        ? {
            margin: financial.margin,
            totalRevenue: financial.totalRevenue,
            budgetRevenue: financial.budgetRevenue,
            bscEnrolments: financial.bscEnrolments,
            ascEnrolments: financial.ascEnrolments,
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
      trend = "stable";
      pillars = {
        financial: result.pillars.financial.score,
        operational: result.pillars.operational.score,
        compliance: result.pillars.compliance.score,
        satisfaction: result.pillars.satisfaction.score,
        teamCulture: result.pillars.teamCulture.score,
      };
      pillarBreakdowns = {
        financial: result.pillars.financial.breakdown,
        operational: result.pillars.operational.breakdown,
        compliance: result.pillars.compliance.breakdown,
        satisfaction: result.pillars.satisfaction.breakdown,
        teamCulture: result.pillars.teamCulture.breakdown,
      };
    }

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      state: s.state,
      status: s.status,
      capacity: s.capacity,
      manager: s.manager,
      score,
      trend,
      pillars,
      pillarBreakdowns,
      metrics: metric
        ? {
            bscOccupancy: metric.bscOccupancy,
            ascOccupancy: metric.ascOccupancy,
            totalEducators: metric.totalEducators,
            educatorsTurnover: metric.educatorsTurnover,
            ratioCompliance: metric.ratioCompliance,
            parentNps: metric.parentNps,
            incidentCount: metric.incidentCount,
            complaintCount: metric.complaintCount,
            overallCompliance: metric.overallCompliance,
            nqsRating: metric.nqsRating,
          }
        : null,
      financials: financial
        ? {
            totalRevenue: financial.totalRevenue,
            totalCosts: financial.totalCosts,
            grossProfit: financial.grossProfit,
            margin: financial.margin,
          }
        : null,
      openIssues: s._count.issues,
      activeTodos: s._count.todos,
      activeProjects: s._count.projects,
    };
  });

  // Sort by score descending
  performance.sort((a, b) => b.score - a.score);

  return NextResponse.json(performance);
}
