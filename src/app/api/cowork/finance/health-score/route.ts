import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/finance/health-score
 * Upsert a centre's health score for a period.
 * Used by: fin-centre-health-score, fin-monthly-pl-summary, ops-weekly-scorecard
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const body = await req.json();
  const { serviceCode, periodStart, periodType, scores, breakdowns } = body;

  if (!serviceCode || !periodStart || !scores) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message:
          "serviceCode, periodStart (YYYY-MM-DD), and scores object required",
      },
      { status: 400 }
    );
  }

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true, name: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const period = new Date(periodStart + "T00:00:00Z");
  const type = periodType || "monthly";

  const healthScore = await prisma.healthScore.upsert({
    where: {
      serviceId_periodType_periodStart: {
        serviceId: service.id,
        periodType: type,
        periodStart: period,
      },
    },
    update: {
      overallScore: scores.overall,
      trend: scores.trend || "stable",
      financialScore: scores.financial || 0,
      operationalScore: scores.operational || 0,
      complianceScore: scores.compliance || 0,
      satisfactionScore: scores.satisfaction || 0,
      teamCultureScore: scores.teamCulture || 0,
      financialBreakdown: breakdowns?.financial || undefined,
      operationalBreakdown: breakdowns?.operational || undefined,
      complianceBreakdown: breakdowns?.compliance || undefined,
      satisfactionBreakdown: breakdowns?.satisfaction || undefined,
      teamCultureBreakdown: breakdowns?.teamCulture || undefined,
      computedAt: new Date(),
    },
    create: {
      serviceId: service.id,
      periodStart: period,
      periodType: type,
      overallScore: scores.overall,
      trend: scores.trend || "stable",
      financialScore: scores.financial || 0,
      operationalScore: scores.operational || 0,
      complianceScore: scores.compliance || 0,
      satisfactionScore: scores.satisfaction || 0,
      teamCultureScore: scores.teamCulture || 0,
      financialBreakdown: breakdowns?.financial || null,
      operationalBreakdown: breakdowns?.operational || null,
      complianceBreakdown: breakdowns?.compliance || null,
      satisfactionBreakdown: breakdowns?.satisfaction || null,
      teamCultureBreakdown: breakdowns?.teamCulture || null,
    },
  });

  return NextResponse.json(
    {
      message: "Health score upserted",
      healthScoreId: healthScore.id,
      serviceCode,
      overall: scores.overall,
      trend: scores.trend || "stable",
    },
    { status: 201 }
  );
}
