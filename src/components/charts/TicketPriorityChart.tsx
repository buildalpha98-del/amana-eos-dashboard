"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartCard } from "./ChartCard";

interface TicketPriorityChartProps {
  data: Record<string, number>;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F59E0B",
  normal: "#3B82F6",
  low: "#6B7280",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

interface PieEntry {
  name: string;
  value: number;
  color: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderLabel(props: any) {
  const { name, percent } = props as { name: string; percent: number };
  return `${name} ${(percent * 100).toFixed(0)}%`;
}

export function TicketPriorityChart({ data }: TicketPriorityChartProps) {
  const chartData: PieEntry[] = Object.entries(data).map(([key, value]) => ({
    name: PRIORITY_LABELS[key] || key,
    value,
    color: PRIORITY_COLORS[key] || "#6B7280",
  }));

  if (chartData.length === 0) {
    return (
      <ChartCard title="Priority Distribution" subtitle="Tickets by priority level">
        <div className="flex items-center justify-center h-[280px] text-sm text-muted">
          No data available
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Priority Distribution" subtitle="Tickets by priority level">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={50}
            paddingAngle={2}
            dataKey="value"
            label={renderLabel}
            labelLine={{ strokeWidth: 1, stroke: "#9CA3AF" }}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [Number(value ?? 0), name ?? ""]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          />
          <Legend
            formatter={(value) => (
              <span className="text-sm text-muted">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
