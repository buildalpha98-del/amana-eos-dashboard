"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS } from "./chart-colors";

interface AgentWorkloadChartProps {
  data: Array<{
    name: string;
    ticketCount: number;
    avgResponseHours: number | null;
  }>;
}

export function AgentWorkloadChart({ data }: AgentWorkloadChartProps) {
  const sortedData = [...data].sort((a, b) => b.ticketCount - a.ticketCount);
  const chartHeight = Math.max(200, sortedData.length * 45);

  if (sortedData.length === 0) {
    return (
      <ChartCard title="Agent Workload" subtitle="Tickets assigned per agent">
        <div className="flex items-center justify-center h-[200px] text-sm text-muted">
          No data available
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Agent Workload" subtitle="Tickets assigned per agent">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={{ stroke: "#E5E7EB" }}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12, fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
            width={75}
          />
          <Tooltip
            formatter={(value: number | string | undefined) => [Number(value ?? 0), "Tickets"]}
            labelFormatter={(label: unknown, payload) => {
              const labelStr = String(label);
              if (payload && payload.length > 0) {
                const item = payload[0].payload as {
                  name: string;
                  avgResponseHours: number | null;
                };
                const avgResp =
                  item.avgResponseHours !== null
                    ? `${item.avgResponseHours}h avg response`
                    : "No response data";
                return `${labelStr} (${avgResp})`;
              }
              return labelStr;
            }}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          />
          <Bar
            dataKey="ticketCount"
            fill={CHART_COLORS.primary}
            radius={[0, 4, 4, 0]}
            maxBarSize={30}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
