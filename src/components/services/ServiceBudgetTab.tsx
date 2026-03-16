"use client";

import { useState, useMemo } from "react";
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
  DollarSign,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  Package,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
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

// ── Constants ───────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
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
  const to = now.toISOString().split("T")[0];
  return { from, to, label: `FY ${fyYear}/${fyYear + 1}` };
}

// ── Main Component ──────────────────────────────────────────

export function ServiceBudgetTab({ serviceId }: { serviceId: string }) {
  const fy = getFYRange();
  const [period, setPeriod] = useState<"weekly" | "monthly">("monthly");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItemRecord | null>(null);

  // Queries
  const { data: summary, isLoading: summaryLoading } = useBudgetSummary({
    serviceId,
    from: fy.from,
    to: fy.to,
    period,
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
      Equipment: Math.round(p.equipmentCost * 100) / 100,
    }));
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Centre Budget</h2>
          <p className="text-sm text-gray-500">{fy.label} — Groceries &amp; Equipment</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "weekly" | "monthly")}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          size="sm"
          icon={ShoppingCart}
          title="Grocery Budget"
          value={formatCurrency(summary?.groceryBudget.total || 0)}
          iconColor={CHART_COLORS.success}
          loading={summaryLoading}
        />
        <StatCard
          size="sm"
          icon={Wrench}
          title="Equipment Budget"
          value={formatCurrency(summary?.equipmentBudget.total || 0)}
          iconColor={CHART_COLORS.info}
          loading={summaryLoading}
        />
        <StatCard
          size="sm"
          icon={DollarSign}
          title="Combined Total"
          value={formatCurrency(summary?.combinedTotal || 0)}
          iconColor={CHART_COLORS.primary}
          loading={summaryLoading}
        />
        <StatCard
          size="sm"
          icon={TrendingUp}
          title="Avg Weekly Cost"
          value={formatCurrency(avgWeeklyCost)}
          iconColor={CHART_COLORS.warning}
          loading={summaryLoading}
        />
      </div>

      {/* Grocery Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-emerald-600" />
          Grocery Budget Breakdown
        </h3>
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
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Session Type</th>
                    <th className="pb-2 font-medium text-right">Total Estimated</th>
                    <th className="pb-2 font-medium text-right">Rate / Head</th>
                    <th className="pb-2 font-medium text-right">Grocery Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <tr>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.primary }} />
                        Before School Care (BSC)
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      {summary?.groceryBudget.bsc.attended.toLocaleString() || 0}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">
                      ${summary?.groceryBudget.bsc.rate.toFixed(2) || "0.80"}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">
                      {formatCurrency(summary?.groceryBudget.bsc.cost || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.accent }} />
                        After School Care (ASC)
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      {summary?.groceryBudget.asc.attended.toLocaleString() || 0}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">
                      ${summary?.groceryBudget.asc.rate.toFixed(2) || "1.20"}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">
                      {formatCurrency(summary?.groceryBudget.asc.cost || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.success }} />
                        Vacation Care (VC)
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      {summary?.groceryBudget.vc.attended.toLocaleString() || 0}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">
                      ${summary?.groceryBudget.vc.rate.toFixed(2) || "4.50"}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">
                      {formatCurrency(summary?.groceryBudget.vc.cost || 0)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td className="pt-3 font-semibold text-gray-900">Total</td>
                    <td className="pt-3 text-right font-semibold">
                      {(
                        (summary?.groceryBudget.bsc.attended || 0) +
                        (summary?.groceryBudget.asc.attended || 0) +
                        (summary?.groceryBudget.vc.attended || 0)
                      ).toLocaleString()}
                    </td>
                    <td className="pt-3" />
                    <td className="pt-3 text-right font-bold text-emerald-700 text-base">
                      {formatCurrency(summary?.groceryBudget.total || 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Auto-calculated from attendance records × grocery rates per head
            </p>
          </>
        )}
      </div>

      {/* Budget Trend Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand" />
            Budget Trend ({period === "monthly" ? "Monthly" : "Weekly"})
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
                formatter={(value: number | undefined) => [`$${(value ?? 0).toFixed(2)}`]}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar
                dataKey="Groceries"
                stackId="budget"
                fill={CHART_COLORS.success}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Equipment"
                stackId="budget"
                fill={CHART_COLORS.info}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Equipment Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            Equipment Purchases
          </h3>
          <button
            onClick={() => {
              setEditingItem(null);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Equipment
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
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
            <Wrench className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No equipment purchases recorded</p>
            <p className="text-xs text-gray-400 mt-1">
              Click &quot;Add Equipment&quot; to log a purchase
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
            <div className="flex justify-between pt-3 border-t border-gray-200 mt-3">
              <span className="text-sm font-semibold text-gray-900">
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
    <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 group transition-colors">
      {/* Category badge */}
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white flex-shrink-0"
        style={{ backgroundColor: CATEGORY_COLORS[item.category] || "#9CA3AF" }}
      >
        {CATEGORY_LABELS[item.category] || item.category}
      </span>

      {/* Name */}
      <span className="flex-1 text-sm text-gray-900 truncate">{item.name}</span>

      {/* Notes */}
      {item.notes && (
        <span className="hidden sm:block text-xs text-gray-400 truncate max-w-[150px]">
          {item.notes}
        </span>
      )}

      {/* Date */}
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateAU(item.date)}
      </span>

      {/* Amount */}
      <span className="text-sm font-semibold text-gray-900 whitespace-nowrap w-20 text-right">
        ${item.amount.toFixed(2)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 text-gray-400 hover:text-brand transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete "${item.name}"?`)) {
              deleteMutation.mutate(item.id, {
                onSuccess: () => toast({ description: "Equipment item deleted" }),
                onError: (err) =>
                  toast({
                    description: err.message,
                    variant: "destructive",
                  }),
              });
            }
          }}
          disabled={deleteMutation.isPending}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
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

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!name.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ description: "Please enter a valid name and amount", variant: "destructive" });
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
            toast({ description: "Equipment item updated" });
            onClose();
          },
          onError: (err) => toast({ description: err.message, variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast({ description: "Equipment item added" });
          onClose();
        },
        onError: (err) => toast({ description: err.message, variant: "destructive" }),
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {isEditing ? "Edit Equipment Item" : "Add Equipment Item"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Item Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kitchen blender"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              required
            />
          </div>

          {/* Amount + Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount ($)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details..."
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
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
