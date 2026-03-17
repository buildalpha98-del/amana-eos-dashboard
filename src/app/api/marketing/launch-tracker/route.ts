import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/marketing/launch-tracker — Data for services in launch/ramp-up phase
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  try {
    const services = await prisma.service.findMany({
      where: {
        status: "active",
        launchPhase: { in: ["launch", "ramp_up"] },
        launchDate: { not: null },
      },
      select: {
        id: true,
        name: true,
        code: true,
        state: true,
        schoolPopulation: true,
        ascTarget: true,
        bscTarget: true,
        launchDate: true,
        launchPhase: true,
      },
    });

    if (services.length === 0) {
      return NextResponse.json({ services: [], hasLaunchCentres: false });
    }

    const now = new Date();

    const centreData = await Promise.all(
      services.map(async (service) => {
        const launchDate = service.launchDate!;
        const weeksSinceLaunch = Math.floor(
          (now.getTime() - launchDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        const currentWeek = Math.min(Math.max(weeksSinceLaunch + 1, 1), 12);

        // Latest attendance
        const [latestASC, latestBSC] = await Promise.all([
          prisma.dailyAttendance.findFirst({
            where: { serviceId: service.id, sessionType: "asc" },
            orderBy: { date: "desc" },
            select: { enrolled: true, attended: true },
          }),
          prisma.dailyAttendance.findFirst({
            where: { serviceId: service.id, sessionType: "bsc" },
            orderBy: { date: "desc" },
            select: { enrolled: true, attended: true },
          }),
        ]);

        // Weekly attendance trend (last 12 weeks)
        const weeklyTrend: number[] = [];
        for (let w = 0; w < 12; w++) {
          const weekStart = new Date(launchDate);
          weekStart.setDate(weekStart.getDate() + w * 7);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 7);

          if (weekStart > now) {
            weeklyTrend.push(0);
            continue;
          }

          const agg = await prisma.dailyAttendance.aggregate({
            where: {
              serviceId: service.id,
              date: { gte: weekStart, lt: weekEnd },
            },
            _sum: { attended: true },
          });
          weeklyTrend.push(agg._sum.attended ?? 0);
        }

        // Enquiry count since launch
        const enquiryCount = await prisma.parentEnquiry.count({
          where: {
            serviceId: service.id,
            deleted: false,
            createdAt: { gte: launchDate },
          },
        });

        // Enrolment count
        const enrolmentCount = await prisma.parentEnquiry.count({
          where: {
            serviceId: service.id,
            deleted: false,
            stage: { in: ["enrolled", "first_session", "retained"] },
            createdAt: { gte: launchDate },
          },
        });

        // Term calendar activities
        const [plannedActivities, completedActivities] = await Promise.all([
          prisma.termCalendarEntry.count({
            where: {
              serviceId: service.id,
              createdAt: { gte: launchDate },
            },
          }),
          prisma.termCalendarEntry.count({
            where: {
              serviceId: service.id,
              status: "completed",
              createdAt: { gte: launchDate },
            },
          }),
        ]);

        // NPS data
        const npsData = await prisma.npsSurveyResponse.aggregate({
          where: {
            serviceId: service.id,
            respondedAt: { gte: launchDate },
          },
          _avg: { score: true },
          _count: true,
        });

        // Determine status
        const trendingUp = weeklyTrend.length >= 2 &&
          weeklyTrend[Math.min(currentWeek - 1, 11)] >= weeklyTrend[Math.max(currentWeek - 2, 0)];
        const activitiesOnTrack = plannedActivities === 0 || (completedActivities / plannedActivities) >= 0.6;
        const status = trendingUp && activitiesOnTrack
          ? "On Track"
          : !trendingUp && !activitiesOnTrack
          ? "At Risk"
          : "Needs Attention";

        return {
          serviceId: service.id,
          serviceName: service.name,
          serviceCode: service.code,
          state: service.state,
          schoolPopulation: service.schoolPopulation ?? 0,
          launchDate: launchDate.toISOString(),
          launchPhase: service.launchPhase,
          currentWeek,
          ascEnrolled: latestASC?.enrolled ?? 0,
          bscEnrolled: latestBSC?.enrolled ?? 0,
          ascTarget: service.ascTarget ?? 0,
          bscTarget: service.bscTarget ?? 0,
          weeklyTrend,
          enquiryCount,
          enrolmentCount,
          plannedActivities,
          completedActivities,
          npsAverage: npsData._avg.score ? Math.round(npsData._avg.score * 10) / 10 : null,
          npsFeedbackCount: npsData._count,
          status,
        };
      }),
    );

    // Global current week (from earliest launch)
    const earliestLaunch = services.reduce(
      (min, s) => (s.launchDate! < min ? s.launchDate! : min),
      services[0].launchDate!,
    );
    const globalWeek = Math.min(
      Math.max(
        Math.floor((now.getTime() - earliestLaunch.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1,
        1,
      ),
      12,
    );

    return NextResponse.json({
      services: centreData,
      hasLaunchCentres: true,
      currentWeek: globalWeek,
    });
  } catch (err) {
    console.error("[Launch Tracker GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
