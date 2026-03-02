import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "monthly";
  const serviceId = searchParams.get("serviceId");

  const where: Record<string, unknown> = {
    periodType: period,
  };
  if (serviceId) where.serviceId = serviceId;

  const financials = await prisma.financialPeriod.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true, state: true, status: true } },
    },
    orderBy: { periodStart: "desc" },
    take: 100,
  });

  // Calculate summary
  const latestPeriodStart = financials.length > 0 ? financials[0].periodStart : null;
  const latestPeriod = latestPeriodStart
    ? financials.filter(f => f.periodStart.getTime() === latestPeriodStart.getTime())
    : [];

  const summary = {
    totalRevenue: latestPeriod.reduce((sum, f) => sum + f.totalRevenue, 0),
    totalCosts: latestPeriod.reduce((sum, f) => sum + f.totalCosts, 0),
    totalProfit: latestPeriod.reduce((sum, f) => sum + f.grossProfit, 0),
    avgMargin: latestPeriod.length > 0
      ? latestPeriod.reduce((sum, f) => sum + f.margin, 0) / latestPeriod.length
      : 0,
    centreCount: latestPeriod.length,
    totalBscAttendance: latestPeriod.reduce((sum, f) => sum + f.bscAttendance, 0),
    totalAscAttendance: latestPeriod.reduce((sum, f) => sum + f.ascAttendance, 0),
  };

  return NextResponse.json({ financials, summary });
}
