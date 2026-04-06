"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Download } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface RevenueData {
  totalGrossFees: number;
  totalCcsEstimate: number;
  totalGapFees: number;
  totalPaymentsReceived: number;
  totalOutstanding: number;
  overdueCount: number;
  byWeek: { weekStarting: string; grossFees: number; gapFees: number; paymentsReceived: number }[];
  byService: { serviceName: string; grossFees: number; gapFees: number; outstanding: number; paymentsReceived: number }[];
}

function fmt$(n: number) {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, variant }: { label: string; value: string; variant?: "danger" }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-muted font-medium uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${variant === "danger" ? "text-red-600" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

export function RevenueReport({ params }: { params: string }) {
  const { data, isLoading } = useQuery<RevenueData>({
    queryKey: ["report-revenue", params],
    queryFn: () => fetchApi(`/api/reports/revenue?${params}`),
    retry: 2,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Gross Fees" value={fmt$(data.totalGrossFees)} />
        <StatCard label="CCS Estimate" value={fmt$(data.totalCcsEstimate)} />
        <StatCard label="Gap Fees" value={fmt$(data.totalGapFees)} />
        <StatCard label="Payments" value={fmt$(data.totalPaymentsReceived)} />
        <StatCard label="Outstanding" value={fmt$(data.totalOutstanding)} variant={data.totalOutstanding > 0 ? "danger" : undefined} />
      </div>

      {/* Weekly area chart */}
      {data.byWeek.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Revenue by Week</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.byWeek}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="weekStarting" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmt$(Number(v ?? 0))} />
              <Area type="monotone" dataKey="grossFees" stroke="#93c5fd" fill="#93c5fd" fillOpacity={0.3} name="Gross Fees" />
              <Area type="monotone" dataKey="gapFees" stroke="#004E64" fill="#004E64" fillOpacity={0.3} name="Gap Fees" />
              <Area type="monotone" dataKey="paymentsReceived" stroke="#FECE00" fill="#FECE00" fillOpacity={0.3} name="Payments" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By service table */}
      {data.byService.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Revenue by Service</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface border-b border-border">
                  <th className="text-left px-4 py-2 font-medium text-muted">Service</th>
                  <th className="text-right px-4 py-2 font-medium text-muted">Gross Fees</th>
                  <th className="text-right px-4 py-2 font-medium text-muted">Gap Fees</th>
                  <th className="text-right px-4 py-2 font-medium text-muted">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.byService.map((s) => (
                  <tr key={s.serviceName} className="border-b border-border">
                    <td className="px-4 py-2 text-foreground">{s.serviceName}</td>
                    <td className="px-4 py-2 text-right">{fmt$(s.grossFees)}</td>
                    <td className="px-4 py-2 text-right">{fmt$(s.gapFees)}</td>
                    <td className="px-4 py-2 text-right text-red-600">{fmt$(s.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted">
        CCS figures are estimates only. Actual CCS is determined by Services Australia via your CCMS provider.
      </p>

      <a
        href={`/api/reports/revenue/export?${params}`}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#004E64] text-white rounded-lg hover:bg-[#003d50] transition-colors"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </a>
    </div>
  );
}
