"use client";

import {
  LineChart,
  Line,
  ResponsiveContainer,
  Area,
  AreaChart,
  Tooltip,
} from "recharts";
import type { TrendPoint } from "@/hooks/useDashboardData";
import { CHART_COLORS } from "@/components/charts/chart-colors";

interface TrendSparklinesProps {
  revenue: TrendPoint[];
  enrolments: TrendPoint[];
  tickets: TrendPoint[];
}

function SparklineCard({
  title,
  data,
  color,
  formatter,
}: {
  title: string;
  data: TrendPoint[];
  color: string;
  formatter: (v: number) => string;
}) {
  const latest = data.length > 0 ? data[data.length - 1].value : 0;
  const prev = data.length > 1 ? data[data.length - 2].value : latest;
  const change = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
  const isUp = change >= 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {data.length > 1 && (
          <span
            className={`text-xs font-semibold ${
              isUp ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {isUp ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-2">
        {formatter(latest)}
      </p>
      {data.length > 0 ? (
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                }}
                formatter={(value: number | string | undefined) => [
                  formatter(Number(value ?? 0)),
                  title,
                ]}
                labelFormatter={(label: unknown) => {
                  const d = new Date(String(label));
                  return d.toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  });
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#grad-${title})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-16 flex items-center justify-center text-xs text-gray-400">
          No trend data yet
        </div>
      )}
    </div>
  );
}

export function TrendSparklines({ revenue, enrolments, tickets }: TrendSparklinesProps) {
  const formatCurrency = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SparklineCard
        title="Revenue Trend"
        data={revenue}
        color={CHART_COLORS.success}
        formatter={formatCurrency}
      />
      <SparklineCard
        title="Enrolment Trend"
        data={enrolments}
        color={CHART_COLORS.info}
        formatter={(v) => v.toLocaleString()}
      />
      <SparklineCard
        title="Ticket Volume"
        data={tickets}
        color={CHART_COLORS.warning}
        formatter={(v) => v.toString()}
      />
    </div>
  );
}
