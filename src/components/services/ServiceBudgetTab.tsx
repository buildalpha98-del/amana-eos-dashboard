"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useBudgetSummary,
  useEquipmentItems,
  useCreateEquipmentItem,
  useUpdateEquipmentItem,
  useDeleteEquipmentItem,
  type BudgetItemRecord,
} from "@/hooks/useBudget";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import {
  ShoppingCart,
  Wrench,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  Package,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS } from "@/components/charts/chart-colors";
import { SESSION_LABELS } from "@/lib/session-labels";

// ── Constants ───────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  groceries: "Groceries",
  kitchen: "Kitchen",
  sports: "Sports",
  art_craft: "Art & Craft",
  furniture: "Furniture",
  technology: "Technology",
  cleaning: "Cleaning",
  safety: "Safety",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  groceries: "#16a34a",
  kitchen: "#F59E0B",
  sports: "#10B981",
  art_craft: "#8B5CF6",
  furniture: "#3B82F6",
  technology: "#004E64",
  cleaning: "#6B7280",
  safety: "#EF4444",
  other: "#9CA3AF",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

// ── Helpers ─────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

function formatDateAU(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function getFYRange(): { from: string; to: string; label: string } {
  const now = new Date();
  const fyYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const from = `${fyYear}-07-01`;
  // 2026-06-15: `to` covers the full FY, not just today. Capping at
  // "today" silently excluded Wed/Thu/Fri entries of the current
  // week from the budget query — the breakdown would show only the
  // first 1–2 days of the week. Coordinators routinely forecast a
  // whole week's bookings at once; the bucket logic downstream
  // slices the FY-wide rows into per-week buckets.
  const to = `${fyYear + 1}-06-30`;
  return { from, to, label: `FY ${fyYear}/${fyYear + 1}` };
}

// ── Main Component ──────────────────────────────────────────

export function ServiceBudgetTab({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient();
  const fy = getFYRange();
  // 2026-06-05: period toggle removed per Daniel — the budget surface
  // is weekly-only now. The data source is the Daily Operations
  // attendance for the current week (per-day grid or the Weekly Data
  // Entry forecast). Monthly view didn't match how coordinators think
  // about grocery spend and the labels never made sense alongside it.
  const period: "weekly" | "monthly" = "weekly";
  // 2026-06-05: weekOffset lets the breakdown follow whichever week
  // the coordinator is forecasting in the Daily Operations grid.
  // Without this the breakdown was always pinned to today's week,
  // so future-week attendance entries silently never appeared.
  // Convention matches the daily grid: 0 = current week, +1 = last
  // week, etc. Negative offsets navigate into the future.
  const [weekOffset, setWeekOffset] = useState(0);
  const selectedWeek = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const mondayDiff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + mondayDiff - weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekOffset]);
  // Use local components, not toISOString — an AEST Monday midnight
  // is Sunday in UTC, so toISOString would bucket us in the prior week.
  const asOfParam = useMemo(() => {
    const y = selectedWeek.getFullYear();
    const m = String(selectedWeek.getMonth() + 1).padStart(2, "0");
    const d = String(selectedWeek.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [selectedWeek]);
  const weekLabel = useMemo(
    () =>
      selectedWeek.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [selectedWeek],
  );
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItemRecord | null>(null);

  // Queries
  const { data: summary, isLoading: summaryLoading } = useBudgetSummary({
    serviceId,
    from: fy.from,
    to: fy.to,
    period,
    asOf: asOfParam,
  });

  const { data: items, isLoading: itemsLoading } = useEquipmentItems({
    serviceId,
    from: fy.from,
    to: fy.to,
    category: categoryFilter || undefined,
  });

  // Derived
  const weeksInRange = useMemo(() => {
    const from = new Date(fy.from);
    const to = new Date(fy.to);
    return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (7 * 86400000)));
  }, [fy.from, fy.to]);

  const avgWeeklyCost = summary
    ? summary.combinedTotal / weeksInRange
    : 0;

  // Chart data
  const chartData = useMemo(() => {
    if (!summary?.periods) return [];
    return summary.periods.map((p) => ({
      period: p.period,
      Groceries: Math.round(p.groceryCost * 100) / 100,
      "Centre Purchases": Math.round(p.equipmentCost * 100) / 100,
    }));
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Header — weekly-only with a week selector so the breakdown
          follows whichever week the coordinator is forecasting in the
          Daily Operations grid (added 2026-06-05). */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Centre Budget</h2>
          <p className="text-sm text-muted">
            {fy.label} — Groceries &amp; Centre Purchases · weekly view
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-1.5 rounded-lg border border-border text-muted hover:text-foreground hover:border-border"
            aria-label="Previous week"
            data-testid="budget-week-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-[160px]">
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
            className="p-1.5 rounded-lg border border-border text-muted hover:text-foreground hover:border-border"
            aria-label="Next week"
            data-testid="budget-week-next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Grocery Budget for the selected week. Shows
              REMAINING — forecast minus actual grocery receipts.
              2026-06-17: was showing the forecast figure regardless
              of what coordinators had logged as grocery purchases,
              so the number never moved when a receipt was added. */}
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted mb-1">Grocery Budget</p>
            <p
              className={cn(
                "text-2xl font-bold",
                (summary?.currentPeriod?.groceryActualSpend ?? 0) >
                  (summary?.currentPeriod?.groceryTotal ?? 0)
                  ? "text-red-600"
                  : "text-emerald-700",
              )}
            >
              ${summary?.currentPeriod?.groceryRemaining?.toFixed(0) || "0"}
            </p>
            <p className="text-xs text-muted mt-1">
              ${summary?.currentPeriod?.groceryActualSpend?.toFixed(0) || "0"}
              {" of "}
              ${summary?.currentPeriod?.groceryTotal?.toFixed(0) || "0"} spent
              · Week of {weekLabel}
            </p>
          </div>

          {/* Card 2: Purchase Budget */}
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted mb-1">Purchase Budget</p>
            <p className="text-2xl font-bold text-foreground">
              ${summary?.monthToDatePurchaseSpend?.toFixed(0) || "0"}
              <span className="text-sm font-normal text-muted">
                {" "}/ ${summary?.monthlyAllocation || 0}
              </span>
            </p>
            {summary?.monthlyAllocation && (
              <>
                <div className="w-full bg-surface rounded-full h-1.5 mt-2">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      (summary.monthToDatePurchaseSpend / summary.monthlyAllocation) > 1
                        ? "bg-red-500"
                        : (summary.monthToDatePurchaseSpend / summary.monthlyAllocation) > 0.8
                        ? "bg-amber-500"
                        : "bg-blue-500"
                    )}
                    style={{
                      width: `${Math.min((summary.monthToDatePurchaseSpend / summary.monthlyAllocation) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted mt-1">{summary.allocationLabel}</p>
              </>
            )}
            <p className="text-[10px] text-muted mt-1">
              Auto-set from weekly attendance · 100+ → $300, otherwise $150
            </p>
          </div>

          {/* Card 3: Budget Remaining (was Card 4 — Total Spend
              removed 2026-06-17 per Daniel, too confusing). */}
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted mb-1">Budget Remaining</p>
            <p className={cn(
              "text-2xl font-bold",
              (summary?.budgetRemaining ?? 0) < 0 ? "text-red-600" : "text-emerald-700"
            )}>
              ${Math.abs(summary?.budgetRemaining ?? 0).toFixed(0)}
              {(summary?.budgetRemaining ?? 0) < 0 && (
                <span className="text-xs font-medium ml-1">over</span>
              )}
            </p>
            <p className="text-xs text-muted mt-1">This month</p>
          </div>
        </div>
      )}

      {/* Grocery Breakdown */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-emerald-600" />
          Grocery Budget Breakdown
        </h3>
        {/* 2026-06-05: make the period explicit so admins don't read
            the row as "FY total" any more. */}
        <p className="text-xs text-muted mb-4">
          Bookings &amp; cost for week of {weekLabel}.
        </p>
        {summaryLoading ? (
          <div className="space-y-3 py-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border/50">
                    <th className="pb-2 font-medium">Session Type</th>
                    <th className="pb-2 font-medium text-right">Total Estimated</th>
                    <th className="pb-2 font-medium text-right">Rate / Head</th>
                    <th className="pb-2 font-medium text-right">Grocery Cost</th>
                  </tr>
                </thead>
                {/* 2026-06-05: each row reads currentPeriod.* (this
                    week / this month) instead of the FY-scoped
                    groceryBudget.*. Matches the heading semantics
                    that admins expect — Total Estimated = bookings
                    this week, not bookings since 1 July. */}
                <tbody className="divide-y divide-border/30">
                  <tr>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.primary }} />
                        {SESSION_LABELS.bsc}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      {summary?.currentPeriod?.bsc.attended.toLocaleString() || 0}
                    </td>
                    <td className="py-2.5 text-right text-muted">
                      ${summary?.currentPeriod?.bsc.rate.toFixed(2) || "0.80"}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-foreground">
                      {formatCurrency(summary?.currentPeriod?.bsc.cost || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.accent }} />
                        {SESSION_LABELS.asc}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      {summary?.currentPeriod?.asc.attended.toLocaleString() || 0}
                    </td>
                    <td className="py-2.5 text-right text-muted">
                      ${summary?.currentPeriod?.asc.rate.toFixed(2) || "1.20"}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-foreground">
                      {formatCurrency(summary?.currentPeriod?.asc.cost || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.success }} />
                        {SESSION_LABELS.vc}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      {summary?.currentPeriod?.vc.attended.toLocaleString() || 0}
                    </td>
                    <td className="py-2.5 text-right text-muted">
                      ${summary?.currentPeriod?.vc.rate.toFixed(2) || "4.50"}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-foreground">
                      {formatCurrency(summary?.currentPeriod?.vc.cost || 0)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td className="pt-3 font-semibold text-foreground">Total</td>
                    <td className="pt-3 text-right font-semibold">
                      {(
                        (summary?.currentPeriod?.bsc.attended || 0) +
                        (summary?.currentPeriod?.asc.attended || 0) +
                        (summary?.currentPeriod?.vc.attended || 0)
                      ).toLocaleString()}
                    </td>
                    <td className="pt-3" />
                    <td className="pt-3 text-right font-bold text-emerald-700 text-base">
                      {formatCurrency(summary?.currentPeriod?.groceryTotal || 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted mt-3">
              Auto-calculated from attendance records × grocery rates per head
            </p>
          </>
        )}
      </div>

      {/* Budget Trend Chart */}
      {chartData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand" />
            Budget Trend (Weekly)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: "#6B7280" }}
                axisLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6B7280" }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  fontSize: "12px",
                }}
                formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`]}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar
                dataKey="Groceries"
                stackId="budget"
                fill={CHART_COLORS.success}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Centre Purchases"
                stackId="budget"
                fill={CHART_COLORS.info}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Equipment Section */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            Centre Purchases
          </h3>
          <button
            onClick={() => {
              setEditingItem(null);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Purchase
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setCategoryFilter(null)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-full border transition-colors",
              !categoryFilter
                ? "bg-brand text-white border-brand"
                : "bg-card text-muted border-border hover:border-border"
            )}
          >
            All
          </button>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-full border transition-colors",
                categoryFilter === cat
                  ? "text-white border-transparent"
                  : "bg-card text-muted border-border hover:border-border"
              )}
              style={
                categoryFilter === cat
                  ? { backgroundColor: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] }
                  : undefined
              }
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Equipment Items List */}
        {itemsLoading ? (
          <div className="space-y-3 py-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : !items?.length ? (
          <div className="text-center py-8">
            <Wrench className="w-8 h-8 text-muted/50 mx-auto mb-2" />
            <p className="text-sm text-muted">No purchases recorded</p>
            <p className="text-xs text-muted mt-1">
              Click &quot;Add Purchase&quot; to log a purchase
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <EquipmentRow
                key={item.id}
                item={item}
                serviceId={serviceId}
                onEdit={() => {
                  setEditingItem(item);
                  setShowAddModal(true);
                }}
              />
            ))}
            <div className="flex justify-between pt-3 border-t border-border mt-3">
              <span className="text-sm font-semibold text-foreground">
                Total ({items.length} item{items.length !== 1 ? "s" : ""})
              </span>
              <span className="text-sm font-bold text-blue-700">
                {formatCurrency(items.reduce((sum, i) => sum + i.amount, 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <EquipmentModal
          serviceId={serviceId}
          item={editingItem}
          onClose={() => {
            setShowAddModal(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

// ── Equipment Row ───────────────────────────────────────────

function EquipmentRow({
  item,
  serviceId,
  onEdit,
}: {
  item: BudgetItemRecord;
  serviceId: string;
  onEdit: () => void;
}) {
  const deleteMutation = useDeleteEquipmentItem(serviceId);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-surface/50 rounded-lg hover:bg-surface group transition-colors">
      {/* Category badge */}
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white flex-shrink-0"
        style={{ backgroundColor: CATEGORY_COLORS[item.category] || "#9CA3AF" }}
      >
        {CATEGORY_LABELS[item.category] || item.category}
      </span>

      {/* Name */}
      <span className="flex-1 text-sm text-foreground truncate">{item.name}</span>

      {/* Notes */}
      {item.notes && (
        <span className="hidden sm:block text-xs text-muted truncate max-w-[150px]">
          {item.notes}
        </span>
      )}

      {/* Date */}
      <span className="text-xs text-muted whitespace-nowrap">
        {formatDateAU(item.date)}
      </span>

      {/* Amount */}
      <span className="text-sm font-semibold text-foreground whitespace-nowrap w-20 text-right">
        ${item.amount.toFixed(2)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 opacity-60 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 text-muted hover:text-brand transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete "${item.name}"?`)) {
              deleteMutation.mutate(item.id, {
                onSuccess: () => toast({ description: "Purchase deleted" }),
                onError: (err) =>
                  toast({
                    description: err.message,
                    variant: "destructive",
                  }),
              });
            }
          }}
          disabled={deleteMutation.isPending}
          className="p-1 text-muted hover:text-red-600 transition-colors disabled:opacity-50"
          title="Delete"
        >
          {deleteMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Equipment Modal ─────────────────────────────────────────

function EquipmentModal({
  serviceId,
  item,
  onClose,
}: {
  serviceId: string;
  item: BudgetItemRecord | null;
  onClose: () => void;
}) {
  const isEditing = !!item;
  const createMutation = useCreateEquipmentItem(serviceId);
  const updateMutation = useUpdateEquipmentItem(serviceId);

  const [name, setName] = useState(item?.name || "");
  const [amount, setAmount] = useState(item?.amount?.toString() || "");
  const [category, setCategory] = useState(item?.category || "other");
  const [date, setDate] = useState(
    item?.date
      ? new Date(item.date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState(item?.notes || "");
  const [notesError, setNotesError] = useState<string | null>(null);

  const isOtherCategory = category === "other";
  const notesMissing = isOtherCategory && !notes.trim();
  const OTHER_NOTES_MESSAGE =
    "Please describe what this item is — the Other category needs a description for later reporting.";

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleCategoryChange = (next: string) => {
    setCategory(next);
    if (next !== "other") setNotesError(null);
  };

  const handleNotesChange = (next: string) => {
    setNotes(next);
    if (notesError && next.trim()) setNotesError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!name.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ description: "Please enter a valid name and amount", variant: "destructive" });
      return;
    }

    if (isOtherCategory && !notes.trim()) {
      setNotesError(OTHER_NOTES_MESSAGE);
      return;
    }

    const payload = {
      name: name.trim(),
      amount: parsedAmount,
      category,
      date,
      notes: notes.trim() || undefined,
    };

    if (isEditing) {
      updateMutation.mutate(
        { itemId: item.id, ...payload },
        {
          onSuccess: () => {
            toast({ description: "Purchase updated" });
            onClose();
          },
          onError: (err) => toast({ description: err.message, variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast({ description: "Purchase added" });
          onClose();
        },
        onError: (err) => toast({ description: err.message, variant: "destructive" }),
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h3 className="text-base font-semibold text-foreground">
            {isEditing ? "Edit Purchase" : "Add Purchase"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">Item Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kitchen blender"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              required
            />
          </div>

          {/* Amount + Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">Amount ($)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">Purchase Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">
              Notes {isOtherCategory ? "(required)" : "(optional)"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder={
                isOtherCategory
                  ? "Please describe what this item is (e.g. cleaning vinegar, gift card for parent event)"
                  : "Additional details..."
              }
              rows={2}
              maxLength={500}
              aria-required={isOtherCategory ? "true" : undefined}
              aria-invalid={notesError ? "true" : undefined}
              aria-describedby={notesError ? "purchase-notes-error" : undefined}
              className={cn(
                "w-full px-3 py-2 border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none",
                notesError ? "border-red-400" : "border-border"
              )}
            />
            {notesError && (
              <p
                id="purchase-notes-error"
                role="alert"
                className="mt-1 text-xs text-red-600"
              >
                {notesError}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground/80 bg-surface rounded-lg hover:bg-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || notesMissing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {isEditing ? "Save Changes" : "Add Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
