"use client";

/**
 * Generic single-series bar chart for the /workforce-reports Workforce tab
 * (headcount by role / service / employment type, tenure distribution).
 * Horizontal layout suits long category labels (service names).
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS } from "./chart-colors";

export interface WorkforceBarDatum {
  label: string;
  count: number;
}

interface WorkforceBarChartProps {
  data: WorkforceBarDatum[];
  color?: string;
  /** Horizontal bars (category axis on the left) — for long labels. */
  horizontal?: boolean;
  height?: number;
  /** Tooltip series name, e.g. "Staff". */
  seriesName?: string;
}

const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid #E5E7EB",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
} as const;

export function WorkforceBarChart({
  data,
  color = CHART_COLORS.primary,
  horizontal = false,
  height,
  seriesName = "Staff",
}: WorkforceBarChartProps) {
  const resolvedHeight =
    height ?? (horizontal ? Math.max(160, data.length * 40 + 40) : 260);

  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height={resolvedHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 24, left: 8, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={{ stroke: "#E5E7EB" }}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [Number(value ?? 0), seriesName]}
            contentStyle={tooltipStyle}
          />
          <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={resolvedHeight}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="label"
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
          formatter={(value) => [Number(value ?? 0), seriesName]}
          contentStyle={tooltipStyle}
        />
        <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}
