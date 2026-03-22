import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const scoresSchema = z.object({
  overall: z.number(),
  trend: z.string().optional(),
  financial: z.number().optional(),
  operational: z.number().optional(),
  compliance: z.number().optional(),
  satisfaction: z.number().optional(),
  teamCulture: z.number().optional(),
});

const breakdownsSchema = z.object({
  financial: z.record(z.string(), z.any()).optional(),
  operational: z.record(z.string(), z.any()).optional(),
  compliance: z.record(z.string(), z.any()).optional(),
  satisfaction: z.record(z.string(), z.any()).optional(),
  teamCulture: z.record(z.string(), z.any()).optional(),
}).optional();

const bodySchema = z.object({
  serviceCode: z.string().min(1),
  periodStart: z.string().min(1),
  periodType: z.string().optional(),
  scores: scoresSchema,
  breakdowns: breakdownsSchema,
});

/**
 * POST /api/cowork/finance/health-score
 * Upsert a centre's health score for a period.
 * Used by: fin-centre-health-score, fin-monthly-pl-summary, ops-weekly-scorecard
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { serviceCode, periodStart, periodType, scores, breakdowns } = parsed.data;

    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true, name: true },
    });

    if (!service) {
      return NextResponse.json(
        { error: `Service ${serviceCode} not found` },
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
        financialBreakdown: breakdowns?.financial ?? undefined,
        operationalBreakdown: breakdowns?.operational ?? undefined,
        complianceBreakdown: breakdowns?.compliance ?? undefined,
        satisfactionBreakdown: breakdowns?.satisfaction ?? undefined,
        teamCultureBreakdown: breakdowns?.teamCulture ?? undefined,
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/finance/health-score", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
