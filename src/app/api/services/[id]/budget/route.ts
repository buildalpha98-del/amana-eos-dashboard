import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonthlyBudget } from "@/lib/budget-helpers";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

/**
 * Head office allocates the budget envelope; coordinators fill in line items
 * for their own service. Owner / head_office / admin can edit any service;
 * coordinator can only touch the service they're assigned to.
 */
export function ensureCoordOwnService(
  role: string,
  userServiceId: string | null | undefined,
  serviceId: string,
) {
  if (role !== "member") return;
  if (!userServiceId || userServiceId !== serviceId) {
    throw ApiError.forbidden(
      "Coordinators can only access the budget for their own service.",
    );
  }
}

// GET /api/services/[id]/budget — budget summary with grocery calc + equipment totals
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  ensureCoordOwnService(
    session.user.role ?? "",
    (session.user as { serviceId?: string | null }).serviceId,
    id,
  );
  const url = new URL(req.url);

  // Default range: current Australian FY (Jul 1 – today)
  const now = new Date();
  const fyStartMonth = 6; // July = index 6
  const fyYear = now.getMonth() >= fyStartMonth ? now.getFullYear() : now.getFullYear() - 1;
  const defaultFrom = new Date(fyYear, fyStartMonth, 1);

  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : defaultFrom;
  const to = url.searchParams.get("to")
    ? new Date(url.searchParams.get("to")!)
    : now;
  const period = url.searchParams.get("period") || "monthly";

  // Fetch service grocery rates
  const service = await prisma.service.findUnique({
    where: { id },
    select: {
      id: true,
      bscGroceryRate: true,
      ascGroceryRate: true,
      vcGroceryRate: true,
    },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Aggregate attendance by session type.
  // `enrolled` stores permanent bookings, `attended` stores casual bookings —
  // groceries are consumed by every booked child regardless of booking type,
  // so the breakdown must sum both.
  const attendanceAgg = await prisma.dailyAttendance.groupBy({
    by: ["sessionType"],
    where: {
      serviceId: id,
      date: { gte: from, lte: to },
    },
    _sum: { enrolled: true, attended: true },
  });

  const attendanceMap: Record<string, number> = { bsc: 0, asc: 0, vc: 0 };
  for (const a of attendanceAgg) {
    attendanceMap[a.sessionType] = (a._sum.enrolled || 0) + (a._sum.attended || 0);
  }

  // 2026-06-05: fall back to FinancialPeriod (the WeeklyDataEntry
  // forecast) for any session that has zero DailyAttendance rows in
  // the range. FinancialPeriod stores per-DAY averages so weekly
  // bookings = bscAttendance × 5 days. Lets coordinators see grocery
  // spend + monthly budget projections from their attendance
  // forecast before the actual daily records exist.
  const needsForecastFallback =
    attendanceMap.bsc === 0 &&
    attendanceMap.asc === 0 &&
    attendanceMap.vc === 0;
  if (needsForecastFallback) {
    const weeklyAgg = await prisma.financialPeriod.aggregate({
      where: {
        serviceId: id,
        periodType: "weekly",
        periodStart: { gte: from, lte: to },
      },
      _sum: {
        bscAttendance: true,
        ascAttendance: true,
        vcAttendance: true,
      },
    });
    attendanceMap.bsc = (weeklyAgg._sum.bscAttendance ?? 0) * 5;
    attendanceMap.asc = (weeklyAgg._sum.ascAttendance ?? 0) * 5;
    attendanceMap.vc = (weeklyAgg._sum.vcAttendance ?? 0) * 5;
  }

  const bscCost = attendanceMap.bsc * service.bscGroceryRate;
  const ascCost = attendanceMap.asc * service.ascGroceryRate;
  const vcCost = attendanceMap.vc * service.vcGroceryRate;
  const groceryTotal = bscCost + ascCost + vcCost;

  // Aggregate equipment items by category
  const equipmentItems = await prisma.budgetItem.findMany({
    where: {
      serviceId: id,
      date: { gte: from, lte: to },
    },
  });

  const equipmentTotal = equipmentItems.reduce((sum, i) => sum + i.amount, 0);

  const categoryMap: Record<string, { total: number; count: number }> = {};
  for (const item of equipmentItems) {
    if (!categoryMap[item.category]) {
      categoryMap[item.category] = { total: 0, count: 0 };
    }
    categoryMap[item.category].total += item.amount;
    categoryMap[item.category].count += 1;
  }
  const byCategory = Object.entries(categoryMap).map(([category, data]) => ({
    category,
    ...data,
  }));

  // Build period buckets
  const periods = buildPeriodBuckets(
    from,
    to,
    period,
    id,
    equipmentItems,
    service
  );

  // We need attendance per period too — query all daily records.
  // Combine enrolled (permanent) + attended (casual) — same rationale as above.
  const dailyRecords = await prisma.dailyAttendance.findMany({
    where: {
      serviceId: id,
      date: { gte: from, lte: to },
    },
    select: { date: true, sessionType: true, enrolled: true, attended: true },
  });

  // Fill attendance into period buckets
  for (const rec of dailyRecords) {
    const bucketKey = getBucketKey(rec.date, period);
    const bucket = periods.find((p) => p.period === bucketKey);
    if (bucket) {
      const bookings = rec.enrolled + rec.attended;
      if (rec.sessionType === "bsc") {
        bucket.bscAttendance += bookings;
        bucket.groceryCost += bookings * service.bscGroceryRate;
      } else if (rec.sessionType === "asc") {
        bucket.ascAttendance += bookings;
        bucket.groceryCost += bookings * service.ascGroceryRate;
      } else if (rec.sessionType === "vc") {
        bucket.vcAttendance += bookings;
        bucket.groceryCost += bookings * service.vcGroceryRate;
      }
      bucket.total = bucket.groceryCost + bucket.equipmentCost;
    }
  }

  // 2026-06-05: same forecast fallback as the aggregate above, but
  // per-bucket so the chart isn't a flat line when DailyAttendance
  // hasn't been recorded yet. Only fills buckets that ended up with
  // zero bookings from the daily roll-call data.
  if (needsForecastFallback) {
    const forecasts = await prisma.financialPeriod.findMany({
      where: {
        serviceId: id,
        periodType: "weekly",
        periodStart: { gte: from, lte: to },
      },
      select: {
        periodStart: true,
        bscAttendance: true,
        ascAttendance: true,
        vcAttendance: true,
      },
    });
    for (const fc of forecasts) {
      const bucketKey = getBucketKey(fc.periodStart, period);
      const bucket = periods.find((p) => p.period === bucketKey);
      if (!bucket) continue;
      // Only fill if the daily-records pass didn't touch this bucket.
      if (
        bucket.bscAttendance === 0 &&
        bucket.ascAttendance === 0 &&
        bucket.vcAttendance === 0
      ) {
        // FinancialPeriod stores per-DAY averages; multiply by 5
        // weekdays to get a comparable weekly booking count.
        const bscWeek = fc.bscAttendance * 5;
        const ascWeek = fc.ascAttendance * 5;
        const vcWeek = fc.vcAttendance * 5;
        bucket.bscAttendance += bscWeek;
        bucket.ascAttendance += ascWeek;
        bucket.vcAttendance += vcWeek;
        bucket.groceryCost +=
          bscWeek * service.bscGroceryRate +
          ascWeek * service.ascGroceryRate +
          vcWeek * service.vcGroceryRate;
        bucket.total = bucket.groceryCost + bucket.equipmentCost;
      }
    }
  }

  // 2026-06-05: derive a "currentPeriod" aggregate scoped to *the
  // selected week* (or month) so the Grocery Spend card and Grocery
  // Budget Breakdown reflect what the coordinator is actually
  // viewing in the Daily Operations grid.
  //
  // Client can pass ?asOf=YYYY-MM-DD to focus on a specific week
  // (e.g. the future week they're forecasting). Without it, defaults
  // to today's week. Critical fix — Daniel was entering attendance
  // for "Week Starting 15 June" while today was June 5, and the
  // breakdown only ever showed today's-week data so future entries
  // never appeared.
  const asOfParam = url.searchParams.get("asOf");
  const focusDate = asOfParam ? new Date(asOfParam) : new Date();
  const currentBucketKey = getBucketKey(focusDate, period);
  const currentBucket = periods.find((p) => p.period === currentBucketKey);
  const currentPeriod = currentBucket
    ? {
        period: currentBucket.period,
        bsc: {
          attended: currentBucket.bscAttendance,
          rate: service.bscGroceryRate,
          cost: currentBucket.bscAttendance * service.bscGroceryRate,
        },
        asc: {
          attended: currentBucket.ascAttendance,
          rate: service.ascGroceryRate,
          cost: currentBucket.ascAttendance * service.ascGroceryRate,
        },
        vc: {
          attended: currentBucket.vcAttendance,
          rate: service.vcGroceryRate,
          cost: currentBucket.vcAttendance * service.vcGroceryRate,
        },
        groceryTotal: currentBucket.groceryCost,
        equipmentTotal: currentBucket.equipmentCost,
        combinedTotal: currentBucket.total,
      }
    : {
        period: currentBucketKey,
        bsc: { attended: 0, rate: service.bscGroceryRate, cost: 0 },
        asc: { attended: 0, rate: service.ascGroceryRate, cost: 0 },
        vc: { attended: 0, rate: service.vcGroceryRate, cost: 0 },
        groceryTotal: 0,
        equipmentTotal: 0,
        combinedTotal: 0,
      };

  // Resolve budget allocation
  const budgetAllocation = await getMonthlyBudget(id);

  // Calculate month-to-date non-grocery purchase spend
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthToDateResult = await prisma.budgetItem.aggregate({
    where: {
      serviceId: id,
      date: { gte: monthStart },
      category: { not: "groceries" },
    },
    _sum: { amount: true },
  });
  const monthToDatePurchaseSpend = monthToDateResult._sum.amount || 0;

  return NextResponse.json({
    // FY-to-date aggregate — kept for callers that want the year
    // figure (e.g. the year-average calculation on the client).
    groceryBudget: {
      total: groceryTotal,
      bsc: { attended: attendanceMap.bsc, rate: service.bscGroceryRate, cost: bscCost },
      asc: { attended: attendanceMap.asc, rate: service.ascGroceryRate, cost: ascCost },
      vc: { attended: attendanceMap.vc, rate: service.vcGroceryRate, cost: vcCost },
    },
    // 2026-06-05: current-period aggregate (this week / this month).
    // What the Grocery Spend card + Grocery Budget Breakdown should
    // be reading — they say "This week"/"This month" on the label.
    currentPeriod,
    equipmentBudget: {
      total: equipmentTotal,
      byCategory,
    },
    combinedTotal: groceryTotal + equipmentTotal,
    monthlyAllocation: budgetAllocation.amount,
    allocationSource: budgetAllocation.source,
    allocationLabel: budgetAllocation.tierLabel || `Override — $${budgetAllocation.amount}/mo`,
    monthToDatePurchaseSpend,
    budgetRemaining: budgetAllocation.amount - monthToDatePurchaseSpend,
    periods: periods.sort((a, b) => a.period.localeCompare(b.period)),
    range: { from: from.toISOString(), to: to.toISOString() },
    rates: {
      bsc: service.bscGroceryRate,
      asc: service.ascGroceryRate,
      vc: service.vcGroceryRate,
    },
  });
}, {
  // Coordinators can read their own service's budget; admin tier sees any.
  // The own-service check fires inline above for coordinators.
  roles: ["owner", "head_office", "admin", "member"],
});

// ── Helpers ─────────────────────────────────────────────────

// 2026-06-05: bucket dates in Australia/Sydney time, not UTC.
//
// The daily-attendance grid stores dates as `toISOString().split("T")[0]`
// from a local-midnight Date — for an AEST/AEDT user (UTC+10/+11) the
// resulting ISO date is the *Sunday* before the local Monday. If we
// bucket by UTC day-of-week, that Sunday lands in the previous week
// and the Grocery Budget Breakdown silently misses the local Monday's
// entry while picking up Tue–Fri (which shift into the correct UTC
// date). Forcing Sydney for the bucket math aligns the breakdown
// with what coordinators actually entered in the grid.
const SYDNEY_TZ = "Australia/Sydney";

function getSydneyParts(date: Date): { year: number; month: number; day: number } {
  // Intl returns the date components as the calendar would read them
  // in Sydney, regardless of where the Node process runs (Vercel = UTC).
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "0");
  return { year, month, day };
}

function getBucketKey(date: Date, period: string): string {
  // Render this date as a Sydney calendar date and bucket from there.
  const { year, month, day } = getSydneyParts(date);
  // Construct a UTC-midnight Date for the Sydney calendar date so the
  // downstream arithmetic stays timezone-independent.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (period === "weekly") {
    // ISO week: find Monday in UTC (date is now a UTC anchor for the
    // Sydney calendar day, so UTC accessors are safe).
    const dow = d.getUTCDay();
    const diff = d.getUTCDate() - dow + (dow === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setUTCDate(diff);
    const yr = monday.getUTCFullYear();
    const oneJan = new Date(Date.UTC(yr, 0, 1));
    const weekNum = Math.ceil(
      ((monday.getTime() - oneJan.getTime()) / 86400000 +
        oneJan.getUTCDay() +
        1) /
        7,
    );
    return `${yr}-W${String(weekNum).padStart(2, "0")}`;
  }
  // monthly — use UTC accessors since `d` is now a UTC-anchored Date
  // representing the Sydney calendar day.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface PeriodBucket {
  period: string;
  groceryCost: number;
  equipmentCost: number;
  total: number;
  bscAttendance: number;
  ascAttendance: number;
  vcAttendance: number;
}

function buildPeriodBuckets(
  from: Date,
  to: Date,
  period: string,
  _serviceId: string,
  equipmentItems: { date: Date; amount: number }[],
  _service: { bscGroceryRate: number; ascGroceryRate: number; vcGroceryRate: number }
): PeriodBucket[] {
  const buckets: Map<string, PeriodBucket> = new Map();

  // Generate all bucket keys in range
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = getBucketKey(cursor, period);
    if (!buckets.has(key)) {
      buckets.set(key, {
        period: key,
        groceryCost: 0,
        equipmentCost: 0,
        total: 0,
        bscAttendance: 0,
        ascAttendance: 0,
        vcAttendance: 0,
      });
    }
    if (period === "weekly") {
      cursor.setDate(cursor.getDate() + 7);
    } else {
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Fill equipment costs into buckets
  for (const item of equipmentItems) {
    const key = getBucketKey(item.date, period);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.equipmentCost += item.amount;
    }
  }

  return Array.from(buckets.values());
}
