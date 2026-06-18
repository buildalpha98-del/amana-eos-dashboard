"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ShoppingCart, Package, AlertTriangle } from "lucide-react";
import { useSpendingBreakdown } from "@/hooks/useSpendingBreakdown";
import { Skeleton } from "@/components/ui/Skeleton";
import { ScrollableTable } from "@/components/ui/ScrollableTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Per-centre weekly grocery + monthly purchase tracking. Surfaces
 * forecast-vs-actual for groceries (week-scoped) and allocation-vs-
 * spend for centre purchases (month-scoped), with colour-coded
 * status so admins can spot overspends at a glance.
 *
 * Mirrors the week-selector convention used by the Service budget
 * tab so the data lines up if a coordinator drills in.
 */
export function CentreSpendingBreakdown() {
  const [weekOffset, setWeekOffset] = useState(0);

  // Build the Monday of the selected week from local components,
  // matching the daily grid convention (avoids the AEST→UTC shift
  // that previously stored Monday entries against Sunday's date).
  const selectedMonday = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const mondayDiff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + mondayDiff - weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekOffset]);

  const weekParam = useMemo(() => {
    const y = selectedMonday.getFullYear();
    const m = String(selectedMonday.getMonth() + 1).padStart(2, "0");
    const d = String(selectedMonday.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [selectedMonday]);

  const weekLabel = useMemo(
    () =>
      selectedMonday.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [selectedMonday],
  );

  const monthLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-AU", {
        month: "long",
        year: "numeric",
      }),
    [],
  );

  const { data, isLoading, error } = useSpendingBreakdown({ week: weekParam });

  // Totals row across centres — handy for the org-wide picture.
  const totals = useMemo(() => {
    if (!data?.rows.length) return null;
    return data.rows.reduce(
      (acc, r) => ({
        groceryForecast: acc.groceryForecast + r.groceryForecast,
        grocerySpend: acc.grocerySpend + r.grocerySpend,
        monthlyAllocation: acc.monthlyAllocation + r.monthlyAllocation,
        monthlyPurchaseSpend:
          acc.monthlyPurchaseSpend + r.monthlyPurchaseSpend,
      }),
      {
        groceryForecast: 0,
        grocerySpend: 0,
        monthlyAllocation: 0,
        monthlyPurchaseSpend: 0,
      },
    );
  }, [data]);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Centre Spending Breakdown
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Weekly groceries (forecast vs receipts) · Monthly purchases (allocation vs spend)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Previous week"
            className="p-1.5 rounded-lg border border-border text-muted hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-[150px]">
            <p className="text-sm font-semibold text-foreground">
              Week of {weekLabel}
            </p>
            {weekOffset === 0 ? (
              <p className="text-[10px] text-brand font-medium">Current Week</p>
            ) : (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="text-[10px] text-muted hover:text-foreground underline"
              >
                Jump to current week
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Next week"
            className="p-1.5 rounded-lg border border-border text-muted hover:text-foreground"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="p-6 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-red-600">
          Failed to load spending breakdown.
        </div>
      ) : !data?.rows.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="No centres yet"
          description="Spending data will appear once centres have attendance or purchases logged."
          variant="inline"
        />
      ) : (
        <ScrollableTable>
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="bg-surface/50 text-left text-[11px] font-semibold text-muted uppercase tracking-wider">
                <th className="px-6 py-3" rowSpan={2}>Centre</th>
                <th
                  colSpan={1}
                  className="px-4 py-2 text-center border-b border-border bg-emerald-50/30"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                    Groceries — Week of {weekLabel}
                  </span>
                </th>
                <th
                  colSpan={3}
                  className="px-4 py-2 text-center border-b border-border bg-blue-50/30"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-600" />
                    Centre Purchases — {monthLabel}
                  </span>
                </th>
              </tr>
              <tr className="bg-surface/50 text-left text-[11px] font-semibold text-muted uppercase tracking-wider">
                {/* 2026-06-17: dropped Groceries Spent + Variance —
                    Daniel asked for forecast only; Centre Purchases
                    section keeps Spent so the duplicate is gone. */}
                <th className="px-4 py-2 text-right">Forecast</th>
                <th className="px-4 py-2 text-right">Allocation</th>
                <th className="px-4 py-2 text-right">Spent</th>
                <th className="px-4 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.rows.map((r) => {
                const monthRatio =
                  r.monthlyAllocation > 0
                    ? r.monthlyPurchaseSpend / r.monthlyAllocation
                    : 0;
                const monthStatus =
                  monthRatio > 1
                    ? "over"
                    : monthRatio > 0.8
                      ? "warn"
                      : "ok";
                return (
                  <tr key={r.service.id} className="hover:bg-surface transition-colors">
                    <td className="px-6 py-3">
                      <div className="font-medium text-foreground">{r.service.name}</div>
                      <div className="text-[11px] text-muted">
                        {r.service.code} · {r.weekBookings} bookings this week
                      </div>
                    </td>
                    {/* Groceries — forecast (only column kept) */}
                    <td className="px-4 py-3 text-right text-muted">
                      {formatCurrency(r.groceryForecast)}
                    </td>
                    {/* Monthly allocation */}
                    <td className="px-4 py-3 text-right text-muted">
                      {formatCurrency(r.monthlyAllocation)}
                    </td>
                    {/* Monthly spent */}
                    <td className="px-4 py-3 text-right">
                      <div className="font-medium text-foreground">
                        {formatCurrency(r.monthlyPurchaseSpend)}
                      </div>
                      <div className="w-20 ml-auto bg-surface rounded-full h-1 mt-1">
                        <div
                          className={cn(
                            "h-1 rounded-full",
                            monthStatus === "over"
                              ? "bg-red-500"
                              : monthStatus === "warn"
                                ? "bg-amber-500"
                                : "bg-emerald-500",
                          )}
                          style={{
                            width: `${Math.min(monthRatio * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </td>
                    {/* Status pill */}
                    <td className="px-4 py-3 text-right">
                      {monthStatus === "over" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700">
                          <AlertTriangle className="w-3 h-3" />
                          Over by {formatCurrency(r.monthlyPurchaseSpend - r.monthlyAllocation)}
                        </span>
                      ) : monthStatus === "warn" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
                          {formatCurrency(r.monthlyRemaining)} left
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                          {formatCurrency(r.monthlyRemaining)} left
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="bg-brand/5 font-semibold text-sm">
                  <td className="px-6 py-3 text-foreground">Total</td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatCurrency(totals.groceryForecast)}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatCurrency(totals.monthlyAllocation)}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatCurrency(totals.monthlyPurchaseSpend)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right",
                      totals.monthlyPurchaseSpend > totals.monthlyAllocation
                        ? "text-red-600"
                        : "text-emerald-600",
                    )}
                  >
                    {formatCurrency(
                      totals.monthlyAllocation - totals.monthlyPurchaseSpend,
                    )}{" "}
                    left
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </ScrollableTable>
      )}
    </div>
  );
}
