"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS } from "./chart-colors";
import type { CentrePerformance } from "@/hooks/usePerformance";

interface OccupancyComparisonChartProps {
  centres: CentrePerformance[];
}

export function OccupancyComparisonChart({ centres }: OccupancyComparisonChartProps) {
  const chartData = [...centres]
    .filter((c) => c.metrics?.ascOccupancy !== undefined && c.metrics?.ascOccupancy !== null)
    .sort((a, b) => (b.metrics?.ascOccupancy || 0) - (a.metrics?.ascOccupancy || 0))
    .map((c) => ({
      name: c.code,
      fullName: c.name,
      occupancy: c.metrics?.ascOccupancy || 0,
    }));

  return (
    <ChartCard title="ASC Occupancy by Centre" subtitle="Compared against 65% target">
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
            domain={[0, 100]}
          />
          <Tooltip
            formatter={(value: number | string | undefined) => [`${Number(value ?? 0).toFixed(1)}%`, "ASC Occupancy"]}
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
          <ReferenceLine
            y={65}
            stroke={CHART_COLORS.warning}
            strokeDasharray="6 4"
            strokeWidth={2}
            label={{
              value: "Target 65%",
              position: "right",
              fill: CHART_COLORS.warning,
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          <Bar
            dataKey="occupancy"
            fill={CHART_COLORS.primary}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
