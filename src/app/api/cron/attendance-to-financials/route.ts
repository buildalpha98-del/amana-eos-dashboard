import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTeamsNotification } from "@/lib/teams-notify";

/**
 * GET /api/cron/attendance-to-financials
 *
 * Weekly cron (Sunday 11 PM AEST) — aggregates the past week's
 * DailyAttendance data and auto-generates FinancialPeriod (weekly) records
 * with calculated revenue based on service daily rates.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Calculate last week's Monday–Friday range
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - dayOfWeek - 6); // Previous Monday
    lastMonday.setHours(0, 0, 0, 0);

    const lastFriday = new Date(lastMonday);
    lastFriday.setDate(lastMonday.getDate() + 4);
    lastFriday.setHours(23, 59, 59, 999);

    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    // Get all active services with rates
    const services = await prisma.service.findMany({
      where: { status: { in: ["active", "onboarding"] } },
      select: {
        id: true,
        name: true,
        code: true,
        bscDailyRate: true,
        ascDailyRate: true,
        vcDailyRate: true,
      },
    });

    let centresProcessed = 0;
    let totalRevenueGenerated = 0;
    const errors: string[] = [];

    for (const service of services) {
      try {
        // Get all attendance records for the week
        const attendance = await prisma.dailyAttendance.findMany({
          where: {
            serviceId: service.id,
            date: { gte: lastMonday, lte: lastFriday },
          },
        });

        if (attendance.length === 0) continue;

        // Aggregate by session type
        let bscTotalAttended = 0;
        let ascTotalAttended = 0;
        let vcTotalAttended = 0;
        let bscTotalEnrolled = 0;
        let ascTotalEnrolled = 0;
        let bscDays = 0;
        let ascDays = 0;

        for (const rec of attendance) {
          if (rec.sessionType === "bsc") {
            bscTotalAttended += rec.attended;
            bscTotalEnrolled += rec.enrolled;
            bscDays++;
          } else if (rec.sessionType === "asc") {
            ascTotalAttended += rec.attended;
            ascTotalEnrolled += rec.enrolled;
            ascDays++;
          } else if (rec.sessionType === "vc") {
            vcTotalAttended += rec.attended;
          }
        }

        // Calculate revenue
        const bscRate = service.bscDailyRate || 0;
        const ascRate = service.ascDailyRate || 0;
        const vcRate = service.vcDailyRate || 0;

        const bscRevenue = bscTotalAttended * bscRate;
        const ascRevenue = ascTotalAttended * ascRate;
        const vcRevenue = vcTotalAttended * vcRate;
        const totalRevenue = bscRevenue + ascRevenue + vcRevenue;

        // Upsert FinancialPeriod (weekly)
        await prisma.financialPeriod.upsert({
          where: {
            serviceId_periodType_periodStart: {
              serviceId: service.id,
              periodType: "weekly",
              periodStart: lastMonday,
            },
          },
          update: {
            bscRevenue,
            ascRevenue,
            vcRevenue,
            totalRevenue,
            bscAttendance: bscDays > 0 ? bscTotalAttended / bscDays : 0,
            ascAttendance: ascDays > 0 ? ascTotalAttended / ascDays : 0,
            bscEnrolments: bscDays > 0 ? Math.round(bscTotalEnrolled / bscDays) : 0,
            ascEnrolments: ascDays > 0 ? Math.round(ascTotalEnrolled / ascDays) : 0,
            dataSource: "auto_attendance",
            periodEnd: lastSunday,
          },
          create: {
            serviceId: service.id,
            periodType: "weekly",
            periodStart: lastMonday,
            periodEnd: lastSunday,
            bscRevenue,
            ascRevenue,
            vcRevenue,
            totalRevenue,
            bscAttendance: bscDays > 0 ? bscTotalAttended / bscDays : 0,
            ascAttendance: ascDays > 0 ? ascTotalAttended / ascDays : 0,
            bscEnrolments: bscDays > 0 ? Math.round(bscTotalEnrolled / bscDays) : 0,
            ascEnrolments: ascDays > 0 ? Math.round(ascTotalEnrolled / ascDays) : 0,
            dataSource: "auto_attendance",
          },
        });

        centresProcessed++;
        totalRevenueGenerated += totalRevenue;
      } catch (err) {
        errors.push(`${service.code}: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // Send Teams summary
    if (centresProcessed > 0) {
      sendTeamsNotification({
        title: "📊 Weekly Financials Auto-Generated",
        body: `Attendance → Financial pipeline processed **${centresProcessed}** centres. Total estimated revenue: **$${totalRevenueGenerated.toLocaleString("en-AU", { minimumFractionDigits: 2 })}**`,
        facts: [
          { title: "Week Of", value: lastMonday.toLocaleDateString("en-AU") },
          { title: "Centres", value: `${centresProcessed}` },
          { title: "Revenue", value: `$${totalRevenueGenerated.toLocaleString("en-AU", { minimumFractionDigits: 2 })}` },
        ],
        actions: [
          { type: "Action.OpenUrl" as const, title: "View Financials", url: `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/financials` },
        ],
      }).catch(() => {});
    }

    return NextResponse.json({
      message: "Attendance → Financial pipeline complete",
      weekOf: lastMonday.toISOString().split("T")[0],
      centresProcessed,
      totalRevenueGenerated: Math.round(totalRevenueGenerated * 100) / 100,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Attendance-to-financials cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
