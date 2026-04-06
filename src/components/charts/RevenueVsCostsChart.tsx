"use client";

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
import { ChartCard } from "./ChartCard";
import { CHART_COLORS } from "./chart-colors";
import type { FinancialPeriodData } from "@/hooks/useFinancials";

interface RevenueVsCostsChartProps {
  data: FinancialPeriodData[];
}

function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function RevenueVsCostsChart({ data }: RevenueVsCostsChartProps) {
  const chartData = data.map((item) => ({
    name: item.service.code,
    fullName: item.service.name,
    revenue: item.totalRevenue,
    costs: item.totalCosts,
  }));

  return (
    <ChartCard title="Revenue vs Costs" subtitle="Grouped comparison by centre">
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
            tickFormatter={(value: number) =>
              `$${Math.round(value / 1000)}k`
            }
          />
          <Tooltip
            formatter={(value, name) => [
              formatAUD(Number(value ?? 0)),
              name === "revenue" ? "Revenue" : "Costs",
            ]}
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
          <Legend
            formatter={(value) =>
              value === "revenue" ? "Revenue" : "Costs"
            }
          />
          <Bar
            dataKey="revenue"
            fill={CHART_COLORS.primary}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          <Bar
            dataKey="costs"
            fill={CHART_COLORS.danger}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
