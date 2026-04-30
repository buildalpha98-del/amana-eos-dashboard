"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { CHART_COLORS } from "./chart-colors";
import { RefreshCw } from "lucide-react";
import { toast } from "@/hooks/useToast";

interface CashFlowPeriod {
  id: string;
  periodMonth: string;
  openingBalance: number;
  totalReceipts: number;
  totalPayments: number;
  netMovement: number;
  closingBalance: number;
  isActual: boolean;
}

function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonth(periodMonth: string): string {
  const [year, month] = periodMonth.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
}

export function CashFlowChart() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["cashflow"],
    queryFn: async () => {
      const res = await fetch("/api/financials/cashflow");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<{ periods: CashFlowPeriod[]; count: number }>;
    },
  });

  const generateForecast = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/financials/cashflow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startingBalance: 0,
          monthlyGrowthRate: 0.02,
          monthlyDebtRepayment: 2000,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate forecast");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashflow"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const chartData = (data?.periods || []).map((p) => ({
    month: formatMonth(p.periodMonth),
    receipts: p.totalReceipts,
    payments: -p.totalPayments, // negative for visual
    closingBalance: p.closingBalance,
    isActual: p.isActual,
  }));

  const hasData = chartData.length > 0;

  return (
    <ChartCard
      title="Cash Flow Forecast"
      subtitle="12-month receipts vs payments with closing balance"
    >
      <div className="flex justify-end mb-4">
        <button
          onClick={() => generateForecast.mutate()}
          disabled={generateForecast.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#004E64] hover:bg-[#003D52] rounded-lg transition disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${generateForecast.isPending ? "animate-spin" : ""}`}
          />
          {generateForecast.isPending
            ? "Generating..."
            : "Generate 12-Month Forecast"}
        </button>
      </div>

      {isLoading ? (
        <div className="h-[350px] flex items-center justify-center text-muted">
          Loading...
        </div>
      ) : !hasData ? (
        <div className="h-[350px] flex flex-col items-center justify-center text-muted gap-2">
          <p>No cash flow data yet</p>
          <p className="text-xs">
            Click &quot;Generate 12-Month Forecast&quot; to create projections from your financial data
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatAUD(Math.abs(v))}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any, name: any) => {
                const labels: Record<string, string> = {
                  receipts: "Receipts",
                  payments: "Payments",
                  closingBalance: "Closing Balance",
                };
                return [formatAUD(Math.abs(value ?? 0)), labels[name] || name];
              }) as never}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #E5E7EB",
                fontSize: "12px",
              }}
            />
            <Legend />
            <ReferenceLine
              y={20000}
              stroke={CHART_COLORS.danger}
              strokeDasharray="5 5"
              label={{
                value: "Min $20K",
                position: "right",
                fill: CHART_COLORS.danger,
                fontSize: 10,
              }}
            />
            <Bar
              dataKey="receipts"
              name="Receipts"
              fill={CHART_COLORS.success}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="payments"
              name="Payments"
              fill={CHART_COLORS.danger}
              radius={[4, 4, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="closingBalance"
              name="Closing Balance"
              stroke={CHART_COLORS.info}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
