"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS, CHART_PALETTE } from "./chart-colors";

interface HistoryPoint {
  month: string;
  score: number;
}

interface CentreHistory {
  id: string;
  name: string;
  points: HistoryPoint[];
}

interface HistoryData {
  centres: CentreHistory[];
  orgAvg: { month: string; score: number | null }[];
  months: string[];
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(parseInt(year), parseInt(m) - 1);
  return date.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

export function ScoreTrendChart() {
  const { data, isLoading } = useQuery<HistoryData>({
    queryKey: ["performance-history"],
    queryFn: async () => {
      const res = await fetch("/api/performance/history?months=6");
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <ChartCard title="Score Trend" subtitle="Historical performance over time">
        <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
          Loading...
        </div>
      </ChartCard>
    );
  }

  if (!data || data.months.length === 0) {
    return (
      <ChartCard title="Score Trend" subtitle="Historical performance over time">
        <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
          No historical data available yet. Scores are computed from monthly metrics snapshots.
        </div>
      </ChartCard>
    );
  }

  // Build chart data: each month as a row, org avg + each centre as a column
  const chartData = data.months.map((month) => {
    const row: Record<string, string | number | null> = { month: formatMonth(month) };
    row["Org Average"] = data.orgAvg.find((a) => a.month === month)?.score ?? null;
    for (const centre of data.centres) {
      const point = centre.points.find((p) => p.month === month);
      row[centre.name] = point?.score ?? null;
    }
    return row;
  });

  return (
    <ChartCard title="Score Trend" subtitle="Historical performance scores (last 6 months)">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={{ stroke: "#E5E7EB" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              fontSize: "12px",
            }}
          />
          <ReferenceLine
            y={60}
            stroke={CHART_COLORS.warning}
            strokeDasharray="4 4"
            label={{
              value: "Attention threshold",
              position: "insideTopRight",
              fill: CHART_COLORS.warning,
              fontSize: 10,
            }}
          />
          {/* Org Average — thick dashed line */}
          <Line
            type="monotone"
            dataKey="Org Average"
            stroke={CHART_COLORS.primary}
            strokeWidth={3}
            strokeDasharray="6 3"
            dot={{ r: 4, fill: CHART_COLORS.primary }}
            connectNulls
          />
          {/* Individual centres */}
          {data.centres.map((centre, i) => (
            <Line
              key={centre.id}
              type="monotone"
              dataKey={centre.name}
              stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
              strokeWidth={1.5}
              dot={{ r: 2.5 }}
              connectNulls
              hide={data.centres.length > 8}
            />
          ))}
          {data.centres.length <= 8 && <Legend wrapperStyle={{ fontSize: "11px" }} />}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
