"use client";

import { useState } from "react";
import { useFinancials } from "@/hooks/useFinancials";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <div className="flex items-center gap-1 mt-1">
              {trend === "up" && <ArrowUpRight className="w-3 h-3 text-emerald-500" />}
              {trend === "down" && <ArrowDownRight className="w-3 h-3 text-red-500" />}
              <p className={cn(
                "text-sm",
                trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-gray-400"
              )}>
                {subtitle}
              </p>
            </div>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + "15", color }}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export default function FinancialsPage() {
  const [period, setPeriod] = useState<string>("monthly");
  const { data, isLoading } = useFinancials({ period });

  const summary = data?.summary;
  const financials = data?.financials || [];

  // Group by service for the latest period
  const latestPeriodStart = financials.length > 0 ? financials[0].periodStart : null;
  const latestData = latestPeriodStart
    ? financials.filter((f) => f.periodStart === latestPeriodStart)
    : [];

  // Sort by total revenue descending
  const sortedData = [...latestData].sort((a, b) => b.totalRevenue - a.totalRevenue);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Financial Dashboard</h2>
          <p className="text-gray-500 mt-1">Revenue, costs, and profitability across all centres</p>
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
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(summary?.totalRevenue || 0)}
          subtitle={`${summary?.centreCount || 0} centres reporting`}
          icon={DollarSign}
          trend="neutral"
          color="#004E64"
        />
        <StatCard
          title="Total Costs"
          value={formatCurrency(summary?.totalCosts || 0)}
          subtitle="all operating costs"
          icon={TrendingDown}
          trend="neutral"
          color="#EF4444"
        />
        <StatCard
          title="Gross Profit"
          value={formatCurrency(summary?.totalProfit || 0)}
          subtitle={summary && summary.totalProfit > 0 ? "profitable" : "needs attention"}
          icon={TrendingUp}
          trend={summary && summary.totalProfit > 0 ? "up" : "down"}
          color="#10B981"
        />
        <StatCard
          title="Avg Margin"
          value={formatPercent(summary?.avgMargin || 0)}
          subtitle="across all centres"
          icon={BarChart3}
          trend={summary && summary.avgMargin > 15 ? "up" : "down"}
          color="#FECE00"
        />
      </div>

      {/* Attendance Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5 text-[#004E64]" />
            <h3 className="text-sm font-medium text-gray-500">Active Centres</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{summary?.centreCount || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <h3 className="text-sm font-medium text-gray-500">BSC Attendance</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{summary?.totalBscAttendance || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <h3 className="text-sm font-medium text-gray-500">ASC Attendance</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{summary?.totalAscAttendance || 0}</p>
        </div>
      </div>

      {/* Revenue by Centre Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Revenue by Centre</h3>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading financial data...</div>
        ) : sortedData.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No financial data for this period yet.</p>
            <p className="text-sm text-gray-400 mt-1">Financial data will appear here once centres start reporting.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Centre</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">BSC Rev</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">ASC Rev</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Total Rev</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Costs</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Profit</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Margin</th>
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
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="bg-[#004E64]/5 font-semibold">
                  <td className="px-6 py-3 text-gray-900">Total</td>
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
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
