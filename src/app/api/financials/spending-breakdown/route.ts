import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getMonthlyBudget } from "@/lib/budget-helpers";

/**
 * Aggregate spending breakdown across all active centres for the
 * Financial Dashboard's "Centre Spending Breakdown" section.
 *
 * Per centre returns:
 *  - weekly grocery forecast (attendance × per-session rate) vs
 *    actual grocery receipts (BudgetItem.category='groceries')
 *  - monthly purchase allocation (tier-based) vs month-to-date
 *    non-grocery BudgetItem spend
 *
 * Query: ?week=YYYY-MM-DD — anchors the weekly forecast/spend pair
 * to the Monday of the queried week. Defaults to current week.
 *
 * One round-trip aggregation per service (group-by + 2 aggregates +
 * tier resolve). Active service count is small (~5–10) so an
 * N-query loop is fine; refactor if it grows.
 */
export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const weekParam = url.searchParams.get("week");

  // Resolve the Monday of the requested week. Build from local
  // components so we don't reintroduce the toISOString TZ shift that
  // bit the daily attendance grid.
  const anchor = weekParam ? new Date(weekParam) : new Date();
  const dow = anchor.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate() + mondayOffset,
    ),
  );
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

  // Calendar-month range for the purchase-budget tracker. The Service
  // budget tab uses `monthStart = new Date(); setDate(1)` — match that
  // so the numbers reconcile.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const services = await prisma.service.findMany({
    where: { active: true },
    select: {
      id: true,
      code: true,
      name: true,
      state: true,
      bscGroceryRate: true,
      ascGroceryRate: true,
      vcGroceryRate: true,
    },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    services.map(async (service) => {
      // Per-session attendance for the chosen week. enrolled =
      // permanent, attended = casual; both consume groceries.
      const byType = await prisma.dailyAttendance.groupBy({
        by: ["sessionType"],
        where: {
          serviceId: service.id,
          date: { gte: weekStart, lt: weekEnd },
        },
        _sum: { enrolled: true, attended: true },
      });

      let groceryForecast = 0;
      let weekBookings = 0;
      const perSession = { bsc: 0, asc: 0, vc: 0 };
      for (const a of byType) {
        const total = (a._sum.enrolled || 0) + (a._sum.attended || 0);
        weekBookings += total;
        if (a.sessionType === "bsc") {
          perSession.bsc = total;
          groceryForecast += total * service.bscGroceryRate;
        } else if (a.sessionType === "asc") {
          perSession.asc = total;
          groceryForecast += total * service.ascGroceryRate;
        } else if (a.sessionType === "vc") {
          perSession.vc = total;
          groceryForecast += total * service.vcGroceryRate;
        }
      }

      // Actual grocery receipts for the week (BudgetItem rows the
      // coordinator logs when they shop). category='groceries'.
      const grocSpend = await prisma.budgetItem.aggregate({
        where: {
          serviceId: service.id,
          category: "groceries",
          date: { gte: weekStart, lt: weekEnd },
        },
        _sum: { amount: true },
      });
      const grocerySpend = grocSpend._sum.amount || 0;

      // Month-to-date non-grocery purchase spend.
      const monthPurch = await prisma.budgetItem.aggregate({
        where: {
          serviceId: service.id,
          category: { not: "groceries" },
          date: { gte: monthStart },
        },
        _sum: { amount: true },
      });
      const monthlyPurchaseSpend = monthPurch._sum.amount || 0;

      const alloc = await getMonthlyBudget(service.id);

      return {
        service: {
          id: service.id,
          code: service.code,
          name: service.name,
          state: service.state,
        },
        weekBookings,
        perSession,
        groceryForecast,
        grocerySpend,
        groceryVariance: grocerySpend - groceryForecast,
        monthlyAllocation: alloc.amount,
        monthlyAllocationSource: alloc.source,
        monthlyPurchaseSpend,
        monthlyRemaining: alloc.amount - monthlyPurchaseSpend,
      };
    }),
  );

  // Helper: format YYYY-MM-DD from a UTC-anchored Date.
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  return NextResponse.json({
    weekStart: fmt(weekStart),
    weekEnd: fmt(new Date(weekEnd.getTime() - 86400000)),
    monthStart: monthStart.toISOString().split("T")[0],
    rows,
  });
});
