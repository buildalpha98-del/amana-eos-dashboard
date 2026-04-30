import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/cron/financials-monthly-rollup
 *
 * Monthly cron (1st of each month, 14:00 UTC) — aggregates the previous month's
 * weekly FinancialPeriod records into a single monthly record per service.
 * Only creates monthly records if weekly data exists.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("financials-monthly-rollup", "monthly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    // Calculate previous month's date range
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    monthEnd.setHours(23, 59, 59, 999);

    // Get all weekly records for the previous month
    const weeklyRecords = await prisma.financialPeriod.findMany({
      where: {
        periodType: "weekly",
        periodStart: { gte: monthStart, lte: monthEnd },
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
    });

    if (weeklyRecords.length === 0) {
      await guard.complete({ servicesRolled: 0, weeklyRecordsAggregated: 0 });
      return NextResponse.json({
        message: "No weekly records found for previous month",
        month: monthStart.toISOString().substring(0, 7),
      });
    }

    // Group by serviceId
    const byService = new Map<string, typeof weeklyRecords>();
    for (const rec of weeklyRecords) {
      const existing = byService.get(rec.serviceId) || [];
      existing.push(rec);
      byService.set(rec.serviceId, existing);
    }

    let centresProcessed = 0;

    for (const [serviceId, records] of byService) {
      const weekCount = records.length;

      // Sum revenue fields
      const bscRevenue = records.reduce((s, r) => s + r.bscRevenue, 0);
      const ascRevenue = records.reduce((s, r) => s + r.ascRevenue, 0);
      const vcRevenue = records.reduce((s, r) => s + r.vcRevenue, 0);
      const otherRevenue = records.reduce((s, r) => s + r.otherRevenue, 0);
      const totalRevenue = bscRevenue + ascRevenue + vcRevenue + otherRevenue;

      // Sum cost fields
      const staffCosts = records.reduce((s, r) => s + r.staffCosts, 0);
      const foodCosts = records.reduce((s, r) => s + r.foodCosts, 0);
      const suppliesCosts = records.reduce((s, r) => s + r.suppliesCosts, 0);
      const rentCosts = records.reduce((s, r) => s + r.rentCosts, 0);
      const adminCosts = records.reduce((s, r) => s + r.adminCosts, 0);
      const otherCosts = records.reduce((s, r) => s + r.otherCosts, 0);
      const totalCosts = staffCosts + foodCosts + suppliesCosts + rentCosts + adminCosts + otherCosts;

      // Derived
      const grossProfit = totalRevenue - totalCosts;
      const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      // Average attendance (across weeks, not sum)
      const bscAttendance = records.reduce((s, r) => s + r.bscAttendance, 0) / weekCount;
      const ascAttendance = records.reduce((s, r) => s + r.ascAttendance, 0) / weekCount;
      const vcAttendance = records.reduce((s, r) => s + r.vcAttendance, 0) / weekCount;
      const bscEnrolments = Math.round(records.reduce((s, r) => s + r.bscEnrolments, 0) / weekCount);
      const ascEnrolments = Math.round(records.reduce((s, r) => s + r.ascEnrolments, 0) / weekCount);

      // Sum budget fields if any weekly records had budget data
      const budgetRevenue = records.some(r => r.budgetRevenue !== null)
        ? records.reduce((s, r) => s + (r.budgetRevenue ?? 0), 0)
        : null;
      const budgetCosts = records.some(r => r.budgetCosts !== null)
        ? records.reduce((s, r) => s + (r.budgetCosts ?? 0), 0)
        : null;

      const data = {
        periodEnd: monthEnd,
        bscRevenue,
        ascRevenue,
        vcRevenue,
        otherRevenue,
        totalRevenue,
        staffCosts,
        foodCosts,
        suppliesCosts,
        rentCosts,
        adminCosts,
        otherCosts,
        totalCosts,
        grossProfit,
        margin,
        bscAttendance,
        ascAttendance,
        vcAttendance,
        bscEnrolments,
        ascEnrolments,
        ...(budgetRevenue !== null && { budgetRevenue }),
        ...(budgetCosts !== null && { budgetCosts }),
        dataSource: "auto_attendance" as const,
      };

      await prisma.financialPeriod.upsert({
        where: {
          serviceId_periodType_periodStart: {
            serviceId,
            periodType: "monthly",
            periodStart: monthStart,
          },
        },
        update: data,
        create: {
          serviceId,
          periodType: "monthly",
          periodStart: monthStart,
          ...data,
        },
      });

      centresProcessed++;
    }

    await guard.complete({
      servicesRolled: centresProcessed,
      weeklyRecordsAggregated: weeklyRecords.length,
    });

    return NextResponse.json({
      message: "Monthly financial rollup complete",
      month: monthStart.toISOString().substring(0, 7),
      centresProcessed,
      weeklyRecordsAggregated: weeklyRecords.length,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
