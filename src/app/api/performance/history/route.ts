import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

function computeScore(
  metric: {
    ascOccupancy: number;
    ratioCompliance: number;
    overallCompliance: number;
    parentNps: number | null;
    incidentCount: number;
    educatorsTurnover: number;
  } | null,
  margin: number | null
): number {
  let score = 50;
  if (metric) {
    score += metric.ascOccupancy > 70 ? 10 : metric.ascOccupancy > 50 ? 5 : 0;
    score += metric.ratioCompliance >= 100 ? 10 : 0;
    score += metric.overallCompliance >= 95 ? 10 : metric.overallCompliance >= 80 ? 5 : 0;
    score += metric.parentNps && metric.parentNps > 60 ? 10 : metric.parentNps && metric.parentNps > 40 ? 5 : 0;
    score += metric.incidentCount === 0 ? 5 : 0;
    score -= metric.educatorsTurnover > 20 ? 10 : metric.educatorsTurnover > 10 ? 5 : 0;
  }
  if (margin !== null) {
    score += margin > 20 ? 10 : margin > 10 ? 5 : margin > 0 ? 2 : -5;
  }
  return Math.max(0, Math.min(100, score));
}

// GET /api/performance/history — returns last 6 months of scores per centre
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const months = parseInt(new URL(req.url).searchParams.get("months") || "6", 10);
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const services = await prisma.service.findMany({
    where: { status: { in: ["active", "onboarding"] } },
    select: {
      id: true,
      name: true,
      metrics: {
        where: { recordedAt: { gte: since } },
        orderBy: { recordedAt: "asc" },
        select: {
          recordedAt: true,
          ascOccupancy: true,
          ratioCompliance: true,
          overallCompliance: true,
          parentNps: true,
          incidentCount: true,
          educatorsTurnover: true,
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
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Build monthly snapshots per centre
  const history = services.map((s) => {
    const points: { month: string; score: number }[] = [];

    // Group metrics by month
    const metricsByMonth: Record<string, typeof s.metrics[0]> = {};
    for (const m of s.metrics) {
      const key = new Date(m.recordedAt).toISOString().slice(0, 7); // YYYY-MM
      metricsByMonth[key] = m; // last one per month wins
    }

    // Group financials by month
    const finByMonth: Record<string, number> = {};
    for (const f of s.financials) {
      const key = new Date(f.periodStart).toISOString().slice(0, 7);
      finByMonth[key] = f.margin;
    }

    // Merge into monthly score points
    const allMonths = new Set([
      ...Object.keys(metricsByMonth),
      ...Object.keys(finByMonth),
    ]);
    const sortedMonths = Array.from(allMonths).sort();

    for (const month of sortedMonths) {
      const metric = metricsByMonth[month] || null;
      const margin = finByMonth[month] ?? null;
      const score = computeScore(metric, margin);
      points.push({ month, score });
    }

    return {
      id: s.id,
      name: s.name,
      points,
    };
  });

  // Also compute organisation average per month
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
      score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    };
  });

  return NextResponse.json({ centres: history, orgAvg, months: sortedMonths });
}
