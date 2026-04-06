"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS } from "./chart-colors";
import type { FinancialPeriodData } from "@/hooks/useFinancials";

interface MarginComparisonChartProps {
  data: FinancialPeriodData[];
}

function getMarginColor(margin: number): string {
  if (margin > 15) return CHART_COLORS.success;
  if (margin > 0) return CHART_COLORS.warning;
  return CHART_COLORS.danger;
}

export function MarginComparisonChart({ data }: MarginComparisonChartProps) {
  const chartData = [...data]
    .sort((a, b) => b.margin - a.margin)
    .map((item) => ({
      name: item.service.code,
      fullName: item.service.name,
      margin: item.margin,
    }));

  return (
    <ChartCard title="Margin by Centre" subtitle="Sorted by profitability">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={{ stroke: "#E5E7EB" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, "Margin"]}
            labelFormatter={(_label, payload) => {
              if (payload && payload.length > 0) {
                const item = payload[0].payload as { fullName: string };
                return item.fullName;
              }
              return String(_label ?? "");
            }}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          />
          <Bar dataKey="margin" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getMarginColor(entry.margin)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
