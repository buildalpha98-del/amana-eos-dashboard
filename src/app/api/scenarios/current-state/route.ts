import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { DEFAULT_INPUTS, type ScenarioInputs } from "@/lib/scenario-engine";

/**
 * GET /api/scenarios/current-state — seed "Current State" inputs from real data
 * Falls back to DEFAULT_INPUTS if no financial data exists.
 */
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    // Count active centres
    const centreCount = await prisma.service.count({ where: { status: "active" } });

    // Average pricing from services
    const avgPricing = await prisma.service.aggregate({
      where: { status: "active" },
      _avg: {
        bscDailyRate: true,
        ascDailyRate: true,
        vcDailyRate: true,
        bscCasualRate: true,
        ascCasualRate: true,
      },
    });

    // Latest financials (prefer monthly, fall back to weekly)
    const latestFinancials = await prisma.financialPeriod.findMany({
      where: { periodType: { in: ["monthly", "weekly"] } },
      orderBy: { periodStart: "desc" },
      take: Math.max(centreCount, 1),
      select: {
        bscAttendance: true,
        ascAttendance: true,
        vcAttendance: true,
      },
    });

    // Compute averages from financial data
    const hasFinancials = latestFinancials.length > 0;
    const avgBscAttendance = hasFinancials
      ? Math.round(
          latestFinancials.reduce((sum, f) => sum + f.bscAttendance, 0) /
            latestFinancials.length /
            20, // ~20 operating days per month
        )
      : DEFAULT_INPUTS.bscAttendancePerDay;
    const avgAscAttendance = hasFinancials
      ? Math.round(
          latestFinancials.reduce((sum, f) => sum + f.ascAttendance, 0) /
            latestFinancials.length /
            20,
        )
      : DEFAULT_INPUTS.ascAttendancePerDay;

    const inputs: ScenarioInputs = {
      ...DEFAULT_INPUTS,
      numCentres: centreCount || DEFAULT_INPUTS.numCentres,
      bscRegularPrice: avgPricing._avg.bscDailyRate ?? DEFAULT_INPUTS.bscRegularPrice,
      ascRegularPrice: avgPricing._avg.ascDailyRate ?? DEFAULT_INPUTS.ascRegularPrice,
      vcPrice: avgPricing._avg.vcDailyRate ?? DEFAULT_INPUTS.vcPrice,
      bscCasualPrice: avgPricing._avg.bscCasualRate ?? DEFAULT_INPUTS.bscCasualPrice,
      ascCasualPrice: avgPricing._avg.ascCasualRate ?? DEFAULT_INPUTS.ascCasualPrice,
      bscAttendancePerDay: avgBscAttendance || DEFAULT_INPUTS.bscAttendancePerDay,
      ascAttendancePerDay: avgAscAttendance || DEFAULT_INPUTS.ascAttendancePerDay,
    };

    return NextResponse.json({
      source: hasFinancials ? "data" : "defaults",
      inputs,
    });
  } catch (err) {
    console.error("[Scenarios Current State]", err);
    return NextResponse.json({
      source: "defaults",
      inputs: DEFAULT_INPUTS,
    });
  }
}
