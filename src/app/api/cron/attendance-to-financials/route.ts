import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTeamsNotification } from "@/lib/teams-notify";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/attendance-to-financials
 *
 * Weekly cron (Sunday 11 PM AEST) — aggregates the past week's
 * DailyAttendance data and auto-generates FinancialPeriod (weekly) records
 * with calculated revenue based on service daily rates.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("attendance-to-financials", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    // Calculate last week's Monday-Friday range using AEST-safe arithmetic
    const nowAEST = new Date(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Sydney",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    );
    const dayOfWeek = nowAEST.getUTCDay(); // 0=Sun, 1=Mon
    const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days since Monday
    const lastMonday = new Date(nowAEST);
    lastMonday.setUTCDate(lastMonday.getUTCDate() - daysBack - 7);
    lastMonday.setUTCHours(0, 0, 0, 0);

    const lastFriday = new Date(lastMonday);
    lastFriday.setUTCDate(lastMonday.getUTCDate() + 4);
    lastFriday.setUTCHours(23, 59, 59, 999);

    const lastSunday = new Date(lastMonday);
    lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);
    lastSunday.setUTCHours(23, 59, 59, 999);

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
        let vcTotalEnrolled = 0;
        let bscDays = 0;
        let ascDays = 0;
        let vcDays = 0;

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
            vcTotalEnrolled += rec.enrolled;
            vcDays++;
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
        // Revenue-only: costs are 0 from auto-attendance, profit = revenue
        const grossProfit = totalRevenue;
        const margin = totalRevenue > 0 ? 100 : 0; // 100% margin when no costs entered

        const attendanceFields = {
          bscAttendance: bscDays > 0 ? bscTotalAttended / bscDays : 0,
          ascAttendance: ascDays > 0 ? ascTotalAttended / ascDays : 0,
          vcAttendance: vcDays > 0 ? vcTotalAttended / vcDays : 0,
          bscEnrolments: bscDays > 0 ? Math.round(bscTotalEnrolled / bscDays) : 0,
          ascEnrolments: ascDays > 0 ? Math.round(ascTotalEnrolled / ascDays) : 0,
        };

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
            grossProfit,
            margin,
            ...attendanceFields,
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
            grossProfit,
            margin,
            ...attendanceFields,
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
      }).catch((err) => logger.error("Failed to send Teams notification for weekly financials auto-generation", { err, centresProcessed }));
    }

    await guard.complete({
      centresProcessed,
      totalRevenueGenerated: Math.round(totalRevenueGenerated * 100) / 100,
      errorCount: errors.length,
    });

    return NextResponse.json({
      message: "Attendance → Financial pipeline complete",
      weekOf: lastMonday.toISOString().split("T")[0],
      centresProcessed,
      totalRevenueGenerated: Math.round(totalRevenueGenerated * 100) / 100,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
