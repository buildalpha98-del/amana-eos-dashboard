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
  const hasData = data.length > 0;
  const latest = hasData ? data[data.length - 1].value : 0;
  const prev = data.length > 1 ? data[data.length - 2].value : latest;
  const change = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
  const isUp = change >= 0;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-muted">{title}</p>
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
      {hasData ? (
        <>
          <p className="text-2xl font-bold text-foreground mb-2">
            {formatter(latest)}
          </p>
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
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 text-muted/50">
          <svg className="w-8 h-8 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <p className="text-xs font-medium text-muted">No data yet</p>
          <p className="text-[10px] text-muted/50 mt-0.5">Data will appear as it&apos;s recorded</p>
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
