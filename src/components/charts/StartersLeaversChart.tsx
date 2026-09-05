"use client";

/**
 * Starters vs leavers per month (trailing 12 months) for the
 * /workforce-reports Workforce tab. Grouped bars: starters in brand
 * primary, leavers in danger red.
 */

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
import { CHART_COLORS } from "./chart-colors";

export interface StartersLeaversDatum {
  /** Short month label, e.g. "Oct 25". */
  month: string;
  starters: number;
  leavers: number;
}

export function StartersLeaversChart({ data }: { data: StartersLeaversDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "#6B7280" }}
          axisLine={{ stroke: "#E5E7EB" }}
          tickLine={false}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={48}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#6B7280" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #E5E7EB",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="starters"
          name="Starters"
          fill={CHART_COLORS.primary}
          radius={[3, 3, 0, 0]}
          maxBarSize={20}
        />
        <Bar
          dataKey="leavers"
          name="Leavers"
          fill={CHART_COLORS.danger}
          radius={[3, 3, 0, 0]}
          maxBarSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
