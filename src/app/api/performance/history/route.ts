import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import {
  computeHealthScore,
  type ScoreInputMetrics,
  type ScoreInputFinancials,
  type ScoreInputEOS,
} from "@/lib/health-score";

// GET /api/performance/history — returns last 6 months of scores per centre
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const months = parseInt(new URL(req.url).searchParams.get("months") || "6", 10);
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  // Attempt to load persisted HealthScore records
  const healthScores = await prisma.healthScore.findMany({
    where: {
      periodType: "monthly",
      periodStart: { gte: since },
    },
    orderBy: { periodStart: "asc" },
    select: {
      serviceId: true,
      periodStart: true,
      overallScore: true,
      financialScore: true,
      operationalScore: true,
      complianceScore: true,
      satisfactionScore: true,
      teamCultureScore: true,
    },
  });

  // Also fetch service names for output
  const services = await prisma.service.findMany({
    where: { status: { in: ["active", "onboarding"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const serviceNameMap = new Map(services.map((s) => [s.id, s.name]));

  if (healthScores.length > 0) {
    // ── Use persisted HealthScore records ────────────────────
    // Group by serviceId
    const byService = new Map<
      string,
      {
        month: string;
        score: number;
        pillars: {
          financial: number;
          operational: number;
          compliance: number;
          satisfaction: number;
          teamCulture: number;
        };
      }[]
    >();

    for (const hs of healthScores) {
      const month = new Date(hs.periodStart).toISOString().slice(0, 7);
      if (!byService.has(hs.serviceId)) {
        byService.set(hs.serviceId, []);
      }
      byService.get(hs.serviceId)!.push({
        month,
        score: Math.round(hs.overallScore),
        pillars: {
          financial: Math.round(hs.financialScore),
          operational: Math.round(hs.operationalScore),
          compliance: Math.round(hs.complianceScore),
          satisfaction: Math.round(hs.satisfactionScore),
          teamCulture: Math.round(hs.teamCultureScore),
        },
      });
    }

    const history = services
      .filter((s) => byService.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        points: byService.get(s.id)!,
      }));

    // Also include services with no scores (empty points)
    for (const s of services) {
      if (!byService.has(s.id)) {
        history.push({ id: s.id, name: s.name, points: [] });
      }
    }

    // Sort by name
    history.sort((a, b) => a.name.localeCompare(b.name));

    // Compute org average per month
    const allMonths = new Set<string>();
    for (const s of history) {
      for (const p of s.points) {
        allMonths.add(p.month);
      }
    }
    const sortedMonths = Array.from(allMonths).sort();

    const orgAvg = sortedMonths.map((month) => {
      const scores = history
        .map((s) => s.points.find((p) => p.month === month)?.score)
        .filter((s): s is number => s !== undefined);
      return {
        month,
        score:
          scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : null,
      };
    });

    return NextResponse.json({ centres: history, orgAvg, months: sortedMonths });
  }

  // ── Fallback: compute from raw metrics/financials ─────────
  const servicesWithData = await prisma.service.findMany({
    where: { status: { in: ["active", "onboarding"] } },
    select: {
      id: true,
      name: true,
      metrics: {
        where: { recordedAt: { gte: since } },
        orderBy: { recordedAt: "asc" },
        select: {
          recordedAt: true,
          bscOccupancy: true,
          ascOccupancy: true,
          ratioCompliance: true,
          overallCompliance: true,
          wwccCompliance: true,
          firstAidCompliance: true,
          parentNps: true,
          incidentCount: true,
          complaintCount: true,
          educatorsTurnover: true,
          nqsRating: true,
        },
      },
      financials: {
        where: {
          periodType: "monthly",
          periodStart: { gte: since },
        },
        orderBy: { periodStart: "asc" },
        select: {
          periodStart: true,
          margin: true,
          totalRevenue: true,
          budgetRevenue: true,
          bscEnrolments: true,
          ascEnrolments: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const emptyEOS: ScoreInputEOS = {
    rocksTotal: 0,
    rocksOnTrack: 0,
    rocksComplete: 0,
    todosOverdue: 0,
    openIssues: 0,
    ticketsTotal: 0,
    ticketsResolved: 0,
  };

  // Build monthly snapshots per centre
  const history = servicesWithData.map((s) => {
    type HistoryPoint = {
      month: string;
      score: number;
      pillars: {
        financial: number;
        operational: number;
        compliance: number;
        satisfaction: number;
        teamCulture: number;
      };
    };
    const points: HistoryPoint[] = [];

    // Group metrics by month
    const metricsByMonth: Record<string, (typeof s.metrics)[0]> = {};
    for (const m of s.metrics) {
      const key = new Date(m.recordedAt).toISOString().slice(0, 7);
      metricsByMonth[key] = m; // last one per month wins
    }

    // Group financials by month
    const finByMonth: Record<string, (typeof s.financials)[0]> = {};
    for (const f of s.financials) {
      const key = new Date(f.periodStart).toISOString().slice(0, 7);
      finByMonth[key] = f;
    }

    // Merge into monthly score points
    const allMonths = new Set([
      ...Object.keys(metricsByMonth),
      ...Object.keys(finByMonth),
    ]);
    const sortedMonths = Array.from(allMonths).sort();

    let previousScore: number | null = null;
    for (const month of sortedMonths) {
      const m = metricsByMonth[month] || null;
      const f = finByMonth[month] || null;

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

      const result = computeHealthScore(metricsInput, financialsInput, emptyEOS, previousScore);
      previousScore = result.overallScore;

      points.push({
        month,
        score: result.overallScore,
        pillars: {
          financial: result.pillars.financial.score,
          operational: result.pillars.operational.score,
          compliance: result.pillars.compliance.score,
          satisfaction: result.pillars.satisfaction.score,
          teamCulture: result.pillars.teamCulture.score,
        },
      });
    }

    return {
      id: s.id,
      name: s.name,
      points,
    };
  });

  // Compute organisation average per month
  const allMonths = new Set<string>();
  for (const s of history) {
    for (const p of s.points) {
      allMonths.add(p.month);
    }
  }
  const sortedMonths = Array.from(allMonths).sort();
  const orgAvg = sortedMonths.map((month) => {
    const scores = history
      .map((s) => s.points.find((p) => p.month === month)?.score)
      .filter((s): s is number => s !== undefined);
    return {
      month,
      score:
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
    };
  });

  return NextResponse.json({ centres: history, orgAvg, months: sortedMonths });
}
