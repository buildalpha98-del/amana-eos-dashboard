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
import type { CentrePerformance } from "@/hooks/usePerformance";

interface ScoreDistributionChartProps {
  centres: CentrePerformance[];
}

const BANDS = [
  { label: "0-39", min: 0, max: 39, color: CHART_COLORS.danger },
  { label: "40-59", min: 40, max: 59, color: CHART_COLORS.warning },
  { label: "60-79", min: 60, max: 79, color: CHART_COLORS.info },
  { label: "80-100", min: 80, max: 100, color: CHART_COLORS.success },
];

export function ScoreDistributionChart({ centres }: ScoreDistributionChartProps) {
  const chartData = BANDS.map((band) => ({
    name: band.label,
    count: centres.filter((c) => c.score >= band.min && c.score <= band.max).length,
    color: band.color,
  }));

  return (
    <ChartCard title="Score Distribution" subtitle="Centre count per score band">
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
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value: number | string | undefined) => [Number(value ?? 0), "Centres"]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
