"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { ChartCard } from "./ChartCard";
import { REVENUE_COLORS } from "./chart-colors";
import type { FinancialPeriodData } from "@/hooks/useFinancials";

interface RevenueBreakdownChartProps {
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

const RADIAN = Math.PI / 180;

function renderCustomLabel(props: PieLabelRenderProps) {
  const cx = Number(props.cx ?? 0);
  const cy = Number(props.cy ?? 0);
  const midAngle = Number(props.midAngle ?? 0);
  const innerRadius = Number(props.innerRadius ?? 0);
  const outerRadius = Number(props.outerRadius ?? 0);
  const percent = Number(props.percent ?? 0);
  const name = String(props.name ?? "");
  const radius = innerRadius + (outerRadius - innerRadius) * 1.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.03) return null;

  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={12}
      fontWeight={500}
    >
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}

export function RevenueBreakdownChart({ data }: RevenueBreakdownChartProps) {
  const totals = data.reduce(
    (acc, item) => ({
      bsc: acc.bsc + item.bscRevenue,
      asc: acc.asc + item.ascRevenue,
      vc: acc.vc + item.vcRevenue,
      other: acc.other + item.otherRevenue,
    }),
    { bsc: 0, asc: 0, vc: 0, other: 0 }
  );

  const pieData = [
    { name: "BSC", value: totals.bsc, color: REVENUE_COLORS.bsc },
    { name: "ASC", value: totals.asc, color: REVENUE_COLORS.asc },
    { name: "VC", value: totals.vc, color: REVENUE_COLORS.vc },
    { name: "Other", value: totals.other, color: REVENUE_COLORS.other },
  ].filter((entry) => entry.value > 0);

  return (
    <ChartCard title="Revenue Breakdown" subtitle="By service type across all centres">
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={3}
            dataKey="value"
            label={renderCustomLabel}
            labelLine={false}
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number | string | undefined) => [formatAUD(Number(value ?? 0)), "Revenue"]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          />
          <Legend
            verticalAlign="bottom"
            formatter={(value: string) => (
              <span style={{ color: "#374151", fontSize: 13 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
