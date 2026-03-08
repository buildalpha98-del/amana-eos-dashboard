"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { DollarSign, TrendingUp, Target, Percent } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { CHART_COLORS, REVENUE_COLORS } from "@/components/charts/chart-colors";
import { formatAUD, formatAUDFull, type ScenarioOutputs } from "@/lib/scenario-engine";

interface Props {
  outputs: ScenarioOutputs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tooltipFormatter(value: any) {
  return formatAUDFull(Number(value ?? 0));
}

export function ScenarioOutputPanel({ outputs }: Props) {
  const revenueData = [
    { name: "BSC", value: outputs.revenueBreakdown.bsc, fill: REVENUE_COLORS.bsc },
    { name: "ASC", value: outputs.revenueBreakdown.asc, fill: REVENUE_COLORS.asc },
    { name: "VC", value: outputs.revenueBreakdown.vc, fill: REVENUE_COLORS.vc },
  ];

  const valuationData = [
    { name: "3x", value: outputs.valuationAt3x },
    { name: "5x", value: outputs.valuationAt5x },
    { name: "8x", value: outputs.valuationAt8x },
    { name: "10x", value: outputs.valuationAt10x },
  ];

  const costData = [
    { name: "Staff", value: outputs.costBreakdown.staff, fill: CHART_COLORS.danger },
    { name: "Centre OH", value: outputs.costBreakdown.centreOverhead, fill: CHART_COLORS.warning },
    { name: "Corp OH", value: outputs.costBreakdown.corporateOverhead, fill: CHART_COLORS.gray },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Cards — Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Network Revenue"
          value={formatAUD(outputs.totalNetworkRevenue)}
          icon={DollarSign}
          iconColor={CHART_COLORS.primary}
          size="sm"
        />
        <StatCard
          title="Network Costs"
          value={formatAUD(outputs.totalNetworkCosts)}
          icon={DollarSign}
          iconColor={CHART_COLORS.danger}
          size="sm"
        />
        <StatCard
          title="Network Profit"
          value={formatAUD(outputs.totalNetworkProfit)}
          icon={TrendingUp}
          iconColor={outputs.totalNetworkProfit >= 0 ? CHART_COLORS.success : CHART_COLORS.danger}
          valueColor={outputs.totalNetworkProfit >= 0 ? "text-emerald-600" : "text-red-600"}
          size="sm"
        />
        <StatCard
          title="Margin"
          value={`${outputs.marginPercent.toFixed(1)}%`}
          icon={Percent}
          iconColor={outputs.marginPercent >= 15 ? CHART_COLORS.success : CHART_COLORS.warning}
          size="sm"
        />
      </div>

      {/* KPI Cards — Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          title="Valuation (5x Profit)"
          value={formatAUD(outputs.valuationAt5x)}
          icon={Target}
          iconColor={CHART_COLORS.info}
          size="sm"
        />
        <StatCard
          title="Valuation (8x Profit)"
          value={formatAUD(outputs.valuationAt8x)}
          icon={Target}
          iconColor={CHART_COLORS.accent}
          size="sm"
        />
        <StatCard
          title="Break-even Centres"
          value={outputs.breakEvenCentres >= 999 ? "N/A" : String(outputs.breakEvenCentres)}
          icon={Target}
          iconColor={CHART_COLORS.success}
          size="sm"
        />
      </div>

      {/* Per Centre Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Per Centre (Annual)</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">Revenue</p>
            <p className="text-sm font-bold text-gray-900">{formatAUD(outputs.annualRevenuePerCentre)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Costs</p>
            <p className="text-sm font-bold text-gray-900">{formatAUD(outputs.annualCostPerCentre)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Profit</p>
            <p className={`text-sm font-bold ${outputs.annualProfitPerCentre >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatAUD(outputs.annualProfitPerCentre)}
            </p>
          </div>
        </div>
      </div>

      {/* Revenue Breakdown Chart */}
      <ChartCard title="Revenue Breakdown" subtitle="Total network revenue by session type">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={revenueData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
            <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: "8px", border: "1px solid #E5E7EB", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
              {revenueData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Valuation Multiples Chart */}
      <ChartCard title="Implied Valuation" subtitle="At various profit multiples">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={valuationData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1_000_000).toFixed(0)}M`} />
            <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: "8px", border: "1px solid #E5E7EB", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} />
            <Bar dataKey="value" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={60} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Cost Breakdown Chart */}
      <ChartCard title="Cost Breakdown" subtitle="Total network costs by category">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={costData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis type="number" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} width={70} />
            <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: "8px", border: "1px solid #E5E7EB", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={30}>
              {costData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
