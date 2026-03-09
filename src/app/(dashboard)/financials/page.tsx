"use client";

import { useState } from "react";
import { useFinancials } from "@/hooks/useFinancials";
import { useServices } from "@/hooks/useServices";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCSV, formatCurrencyCSV } from "@/lib/csv-export";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Building2,
  Plus,
  X,
  RefreshCw,
  Pencil,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useXeroStatus, useXeroSync } from "@/hooks/useXero";
import { RevenueVsCostsChart } from "@/components/charts/RevenueVsCostsChart";
import { MarginComparisonChart } from "@/components/charts/MarginComparisonChart";
import { RevenueBreakdownChart } from "@/components/charts/RevenueBreakdownChart";
import { ImportOWNAModal } from "@/components/financials/ImportOWNAModal";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function XeroSyncBadge() {
  const { data: xeroStatus } = useXeroStatus();
  const sync = useXeroSync();

  if (!xeroStatus || xeroStatus.status === "disconnected") return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#13B5EA]/10 text-[#13B5EA] text-xs font-medium">
        <div className="w-1.5 h-1.5 rounded-full bg-[#13B5EA]" />
        Xero Connected
      </div>
      {xeroStatus.lastSyncAt && (
        <span className="text-xs text-gray-400">
          Last sync: {new Date(xeroStatus.lastSyncAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      <button
        onClick={() => sync.mutate(1)}
        disabled={sync.isPending}
        className="flex items-center gap-1 text-xs text-[#004E64] hover:text-[#003D52] font-medium disabled:opacity-50"
      >
        <RefreshCw className={cn("w-3.5 h-3.5", sync.isPending && "animate-spin")} />
        {sync.isPending ? "Syncing..." : "Sync Now"}
      </button>
    </div>
  );
}

function EnterDataModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: services } = useServices("active");
  const [serviceId, setServiceId] = useState("");
  const [periodType, setPeriodType] = useState<"monthly" | "quarterly">("monthly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [bscRevenue, setBscRevenue] = useState(0);
  const [ascRevenue, setAscRevenue] = useState(0);
  const [vcRevenue, setVcRevenue] = useState(0);
  const [otherRevenue, setOtherRevenue] = useState(0);
  const [staffCosts, setStaffCosts] = useState(0);
  const [foodCosts, setFoodCosts] = useState(0);
  const [suppliesCosts, setSuppliesCosts] = useState(0);
  const [rentCosts, setRentCosts] = useState(0);
  const [adminCosts, setAdminCosts] = useState(0);
  const [otherCosts, setOtherCosts] = useState(0);
  const [budgetRevenue, setBudgetRevenue] = useState(0);
  const [budgetCosts, setBudgetCosts] = useState(0);

  const totalRev = bscRevenue + ascRevenue + vcRevenue + otherRevenue;
  const totalCost = staffCosts + foodCosts + suppliesCosts + rentCosts + adminCosts + otherCosts;

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/financials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId, periodType, periodStart, periodEnd,
          bscRevenue, ascRevenue, vcRevenue, otherRevenue,
          staffCosts, foodCosts, suppliesCosts, rentCosts, adminCosts, otherCosts,
          ...(budgetRevenue > 0 && { budgetRevenue }),
          ...(budgetCosts > 0 && { budgetCosts }),
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financials"] });
      onClose();
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg sm:mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Enter Financial Data</h3>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {/* Centre */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Centre</label>
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]">
              <option value="">Select centre...</option>
              {services?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </select>
          </div>
          {/* Period */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Period Type</label>
              <select value={periodType} onChange={(e) => setPeriodType(e.target.value as "monthly" | "quarterly")} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Start Date</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">End Date</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]" />
            </div>
          </div>
          {/* Revenue */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Revenue ($)</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "BSC", val: bscRevenue, set: setBscRevenue },
                { label: "ASC", val: ascRevenue, set: setAscRevenue },
                { label: "VC", val: vcRevenue, set: setVcRevenue },
                { label: "Other", val: otherRevenue, set: setOtherRevenue },
              ].map((f) => (
                <div key={f.label}>
                  <label className="text-[10px] text-gray-400">{f.label}</label>
                  <input type="number" min={0} value={f.val || ""} onChange={(e) => f.set(Number(e.target.value) || 0)} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]" />
                </div>
              ))}
            </div>
            <p className="text-xs text-[#004E64] font-medium mt-1">Total Revenue: {formatCurrency(totalRev)}</p>
          </div>
          {/* Costs */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Costs ($)</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Staff", val: staffCosts, set: setStaffCosts },
                { label: "Food", val: foodCosts, set: setFoodCosts },
                { label: "Supplies", val: suppliesCosts, set: setSuppliesCosts },
                { label: "Rent", val: rentCosts, set: setRentCosts },
                { label: "Admin", val: adminCosts, set: setAdminCosts },
                { label: "Other", val: otherCosts, set: setOtherCosts },
              ].map((f) => (
                <div key={f.label}>
                  <label className="text-[10px] text-gray-400">{f.label}</label>
                  <input type="number" min={0} value={f.val || ""} onChange={(e) => f.set(Number(e.target.value) || 0)} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]" />
                </div>
              ))}
            </div>
            <p className="text-xs text-red-600 font-medium mt-1">Total Costs: {formatCurrency(totalCost)}</p>
          </div>
          {/* Budget */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Budget (optional)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400">Budget Revenue</label>
                <input type="number" min={0} value={budgetRevenue || ""} onChange={(e) => setBudgetRevenue(Number(e.target.value) || 0)} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400">Budget Costs</label>
                <input type="number" min={0} value={budgetCosts || ""} onChange={(e) => setBudgetCosts(Number(e.target.value) || 0)} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]" />
              </div>
            </div>
          </div>
          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Gross Profit</span>
              <span className={cn("text-sm font-bold", totalRev - totalCost >= 0 ? "text-emerald-600" : "text-red-600")}>
                {formatCurrency(totalRev - totalCost)}
              </span>
            </div>
            {budgetRevenue > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Revenue vs Budget</span>
                <span className={cn("text-sm font-semibold", totalRev >= budgetRevenue ? "text-emerald-600" : "text-amber-600")}>
                  {formatCurrency(totalRev - budgetRevenue)} ({totalRev >= budgetRevenue ? "+" : ""}{((totalRev - budgetRevenue) / budgetRevenue * 100).toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={() => submit.mutate()}
            disabled={!serviceId || !periodStart || !periodEnd || submit.isPending}
            className="px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] disabled:opacity-50"
          >
            {submit.isPending ? "Saving..." : "Save Data"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FinancialsPage() {
  const [period, setPeriod] = useState<string>("monthly");
  const [showEnterData, setShowEnterData] = useState(false);
  const [showImportOWNA, setShowImportOWNA] = useState(false);
  const { data, isLoading, error, refetch } = useFinancials({ period });

  const summary = data?.summary;
  const financials = data?.financials || [];

  // Group by service for the latest period
  const latestPeriodStart = financials.length > 0 ? financials[0].periodStart : null;
  const latestData = latestPeriodStart
    ? financials.filter((f) => f.periodStart === latestPeriodStart)
    : [];

  // Sort by total revenue descending
  const sortedData = [...latestData].sort((a, b) => b.totalRevenue - a.totalRevenue);

  const handleExport = () => {
    if (!data?.financials) return;
    exportToCSV(
      data.financials.map((f: any) => ({
        centre: f.service.name,
        state: f.service.state,
        bscRevenue: f.bscRevenue,
        ascRevenue: f.ascRevenue,
        totalRevenue: f.totalRevenue,
        totalCosts: f.totalCosts,
        grossProfit: f.grossProfit,
        margin: f.margin,
      })),
      `financials-${period}`,
      [
        { key: "centre", header: "Centre" },
        { key: "state", header: "State" },
        { key: "bscRevenue", header: "BSC Revenue", formatter: (v) => formatCurrencyCSV(v as number) },
        { key: "ascRevenue", header: "ASC Revenue", formatter: (v) => formatCurrencyCSV(v as number) },
        { key: "totalRevenue", header: "Total Revenue", formatter: (v) => formatCurrencyCSV(v as number) },
        { key: "totalCosts", header: "Total Costs", formatter: (v) => formatCurrencyCSV(v as number) },
        { key: "grossProfit", header: "Gross Profit", formatter: (v) => formatCurrencyCSV(v as number) },
        { key: "margin", header: "Margin %", formatter: (v) => `${(v as number).toFixed(1)}%` },
      ]
    );
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Financial Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">Revenue, costs, and profitability across all centres</p>
        </div>
        <ErrorState
          title="Failed to load financials"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Financial Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">Revenue, costs, and profitability across all centres</p>
          <div className="mt-2">
            <XeroSyncBadge />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportOWNA(true)}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 border border-[#004E64] text-[#004E64] text-sm font-medium rounded-lg hover:bg-[#004E64]/5 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Import from OWNA</span>
              <span className="sm:hidden">Import</span>
            </button>
            <button
              onClick={() => setShowEnterData(true)}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Enter Data</span>
              <span className="sm:hidden">Add</span>
            </button>
            <ExportButton onClick={handleExport} disabled={!data?.financials || data.financials.length === 0} />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { label: "Weekly", value: "weekly" },
            { label: "Monthly", value: "monthly" },
            { label: "Quarterly", value: "quarterly" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors",
                period === opt.value
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {opt.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(summary?.totalRevenue || 0)}
          subtitle={`${summary?.centreCount || 0} centres reporting`}
          icon={DollarSign}
          trend="neutral"
          iconColor="#004E64"
        />
        <StatCard
          title="Total Costs"
          value={formatCurrency(summary?.totalCosts || 0)}
          subtitle="all operating costs"
          icon={TrendingDown}
          trend="neutral"
          iconColor="#EF4444"
        />
        <StatCard
          title="Gross Profit"
          value={formatCurrency(summary?.totalProfit || 0)}
          subtitle={summary && summary.totalProfit > 0 ? "profitable" : "needs attention"}
          icon={TrendingUp}
          trend={summary && summary.totalProfit > 0 ? "up" : "down"}
          iconColor="#10B981"
        />
        <StatCard
          title="Avg Margin"
          value={formatPercent(summary?.avgMargin || 0)}
          subtitle="across all centres"
          icon={BarChart3}
          trend={summary && summary.avgMargin > 15 ? "up" : "down"}
          iconColor="#FECE00"
        />
      </div>

      {/* Attendance Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5 text-[#004E64]" />
            <h3 className="text-sm font-medium text-gray-500">Active Centres</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{summary?.centreCount || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <h3 className="text-sm font-medium text-gray-500">BSC Attendance</h3>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{summary?.totalBscAttendance || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <h3 className="text-sm font-medium text-gray-500">ASC Attendance</h3>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{summary?.totalAscAttendance || 0}</p>
        </div>
      </div>

      {/* Charts */}
      {sortedData.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueVsCostsChart data={sortedData} />
            <MarginComparisonChart data={sortedData} />
          </div>
          <RevenueBreakdownChart data={sortedData} />
        </>
      )}

      {/* Revenue by Centre Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Revenue by Centre</h3>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : sortedData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#004E64]/5 flex items-center justify-center mb-4">
              <DollarSign className="w-8 h-8 text-[#004E64]/30" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              No financial data for this period
            </h3>
            <p className="text-gray-500 mt-2 max-w-md">
              Revenue and financial data will appear here once service centres
              begin reporting or data is synced from Xero.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Centre</th>
                  <th className="px-2 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center w-12">Source</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">BSC Rev</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">ASC Rev</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Total Rev</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Costs</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Profit</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Margin</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Budget</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedData.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "hover:bg-gray-50 transition-colors",
                      row.grossProfit > 0 ? "" : "bg-red-50/50"
                    )}
                  >
                    <td className="px-6 py-3 font-medium text-gray-900">{row.service.name}</td>
                    <td className="px-2 py-3 text-center">
                      {row.dataSource === "xero" ? (
                        <span title="Synced from Xero"><RefreshCw className="w-3.5 h-3.5 text-[#13B5EA] inline-block" /></span>
                      ) : (
                        <span title="Manually entered"><Pencil className="w-3.5 h-3.5 text-gray-400 inline-block" /></span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {row.service.state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.bscRevenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.ascRevenue)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(row.totalRevenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.totalCosts)}</td>
                    <td className={cn(
                      "px-4 py-3 text-right font-semibold",
                      row.grossProfit > 0 ? "text-emerald-600" : "text-red-600"
                    )}>
                      {formatCurrency(row.grossProfit)}
                    </td>
                    <td className={cn(
                      "px-4 py-3 text-right font-semibold",
                      row.margin > 15 ? "text-emerald-600" : row.margin > 0 ? "text-amber-600" : "text-red-600"
                    )}>
                      {formatPercent(row.margin)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {row.budgetRevenue ? formatCurrency(row.budgetRevenue) : "—"}
                    </td>
                    <td className={cn(
                      "px-4 py-3 text-right font-semibold",
                      !row.budgetRevenue ? "text-gray-400" :
                      row.totalRevenue >= row.budgetRevenue ? "text-emerald-600" : "text-red-600"
                    )}>
                      {row.budgetRevenue
                        ? `${row.totalRevenue >= row.budgetRevenue ? "+" : ""}${formatPercent(((row.totalRevenue - row.budgetRevenue) / row.budgetRevenue) * 100)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="bg-[#004E64]/5 font-semibold">
                  <td className="px-6 py-3 text-gray-900">Total</td>
                  <td className="px-2 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatCurrency(sortedData.reduce((s, r) => s + r.bscRevenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatCurrency(sortedData.reduce((s, r) => s + r.ascRevenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatCurrency(sortedData.reduce((s, r) => s + r.totalRevenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatCurrency(sortedData.reduce((s, r) => s + r.totalCosts, 0))}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right",
                    sortedData.reduce((s, r) => s + r.grossProfit, 0) > 0 ? "text-emerald-600" : "text-red-600"
                  )}>
                    {formatCurrency(sortedData.reduce((s, r) => s + r.grossProfit, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatPercent(
                      sortedData.length > 0
                        ? sortedData.reduce((s, r) => s + r.margin, 0) / sortedData.length
                        : 0
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {(() => {
                      const totalBudget = sortedData.reduce((s, r) => s + (r.budgetRevenue ?? 0), 0);
                      return totalBudget > 0 ? formatCurrency(totalBudget) : "—";
                    })()}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-semibold", (() => {
                    const totalBudget = sortedData.reduce((s, r) => s + (r.budgetRevenue ?? 0), 0);
                    const totalActual = sortedData.reduce((s, r) => s + r.totalRevenue, 0);
                    return totalBudget > 0 ? (totalActual >= totalBudget ? "text-emerald-600" : "text-red-600") : "text-gray-400";
                  })())}>
                    {(() => {
                      const totalBudget = sortedData.reduce((s, r) => s + (r.budgetRevenue ?? 0), 0);
                      const totalActual = sortedData.reduce((s, r) => s + r.totalRevenue, 0);
                      if (totalBudget <= 0) return "—";
                      const pct = ((totalActual - totalBudget) / totalBudget) * 100;
                      return `${pct >= 0 ? "+" : ""}${formatPercent(pct)}`;
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <EnterDataModal open={showEnterData} onClose={() => setShowEnterData(false)} />
      <ImportOWNAModal open={showImportOWNA} onClose={() => setShowImportOWNA(false)} />
    </div>
  );
}
