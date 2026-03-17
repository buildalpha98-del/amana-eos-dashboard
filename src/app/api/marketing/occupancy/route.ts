import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/marketing/occupancy — Occupancy heatmap data per centre
 * Returns current enrolment vs targets, penetration rates, and week-on-week trends.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const stateFilter = searchParams.get("state");

  try {
    // Get all active services with their marketing fields
    const services = await prisma.service.findMany({
      where: {
        status: "active",
        ...(stateFilter ? { state: stateFilter } : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        state: true,
        schoolPopulation: true,
        ascTarget: true,
        bscTarget: true,
        weeklyAttendanceTarget: true,
        parentSegment: true,
        parentDriver: true,
        launchDate: true,
        launchPhase: true,
      },
    });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate start of this week (Monday) and last week
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - mondayOffset);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);

    // Fetch latest attendance and weekly trends for all services in parallel
    const centreData = await Promise.all(
      services.map(async (service) => {
        // Latest ASC enrolment
        const latestASC = await prisma.dailyAttendance.findFirst({
          where: { serviceId: service.id, sessionType: "asc" },
          orderBy: { date: "desc" },
          select: { enrolled: true, attended: true },
        });

        // Latest BSC enrolment
        const latestBSC = await prisma.dailyAttendance.findFirst({
          where: { serviceId: service.id, sessionType: "bsc" },
          orderBy: { date: "desc" },
          select: { enrolled: true, attended: true },
        });

        // This week's total attended (all session types)
        const thisWeekAttendance = await prisma.dailyAttendance.aggregate({
          where: {
            serviceId: service.id,
            date: { gte: thisWeekStart, lt: today },
          },
          _sum: { attended: true },
          _count: true,
        });

        // Last week's total attended
        const lastWeekAttendance = await prisma.dailyAttendance.aggregate({
          where: {
            serviceId: service.id,
            date: { gte: lastWeekStart, lt: thisWeekStart },
          },
          _sum: { attended: true },
          _count: true,
        });

        const currentASC = latestASC?.enrolled ?? 0;
        const currentBSC = latestBSC?.enrolled ?? 0;
        const ascTarget = service.ascTarget ?? 0;
        const bscTarget = service.bscTarget ?? 0;
        const schoolPop = service.schoolPopulation ?? 0;

        const ascPenetration = schoolPop > 0
          ? Math.round((currentASC / schoolPop) * 1000) / 10
          : 0;
        const bscPenetration = schoolPop > 0
          ? Math.round((currentBSC / schoolPop) * 1000) / 10
          : 0;

        const ascGap = Math.max(0, ascTarget - currentASC);
        const bscGap = Math.max(0, bscTarget - currentBSC);
        const totalGap = ascGap + bscGap;

        // Week-on-week trend
        const thisWeekTotal = thisWeekAttendance._sum.attended ?? 0;
        const lastWeekTotal = lastWeekAttendance._sum.attended ?? 0;
        // Normalise by count of days to get daily average
        const thisWeekDays = thisWeekAttendance._count || 1;
        const lastWeekDays = lastWeekAttendance._count || 1;
        const thisWeekAvg = thisWeekTotal / thisWeekDays;
        const lastWeekAvg = lastWeekTotal / lastWeekDays;
        const weekOnWeekTrend = lastWeekAvg > 0
          ? Math.round(((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 100)
          : 0;

        // Status based on progress toward target
        const totalCurrent = currentASC + currentBSC;
        const totalTarget = ascTarget + bscTarget;
        const progressPct = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 100;
        const status = progressPct >= 80 ? "green" : progressPct >= 50 ? "amber" : "red";

        // ASC/BSC individual status
        const ascProgressPct = ascTarget > 0 ? (currentASC / ascTarget) * 100 : 100;
        const bscProgressPct = bscTarget > 0 ? (currentBSC / bscTarget) * 100 : 100;
        const ascStatus = ascProgressPct >= 80 ? "green" : ascProgressPct >= 50 ? "amber" : "red";
        const bscStatus = bscProgressPct >= 80 ? "green" : bscProgressPct >= 50 ? "amber" : "red";

        return {
          serviceId: service.id,
          serviceName: service.name,
          serviceCode: service.code,
          state: service.state,
          schoolPopulation: schoolPop,
          currentASC,
          currentBSC,
          ascTarget,
          bscTarget,
          ascPenetration,
          bscPenetration,
          ascGap,
          bscGap,
          totalGap,
          ascStatus,
          bscStatus,
          weekOnWeekTrend,
          status,
          parentSegment: service.parentSegment,
          parentDriver: service.parentDriver,
          launchDate: service.launchDate,
          launchPhase: service.launchPhase,
          thisWeekAttended: thisWeekTotal,
        };
      }),
    );

    // Network totals
    const totalCurrentWeekly = centreData.reduce(
      (sum, c) => sum + c.thisWeekAttended,
      0,
    );
    const networkTarget = 2000;
    const networkPercentage = Math.round((totalCurrentWeekly / networkTarget) * 100);

    return NextResponse.json({
      centres: centreData,
      network: {
        totalCurrentWeekly,
        target: networkTarget,
        percentage: networkPercentage,
      },
    });
  } catch (err) {
    console.error("[Occupancy GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
