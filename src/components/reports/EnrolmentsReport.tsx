"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface EnrolmentsData {
  totalApplications: number;
  byStatus: Record<string, number>;
  approvalRate: number;
  averageApprovalTimeHours: number;
  byService: { serviceName: string; total: number; approved: number; declined: number; pending: number }[];
  byMonth: { month: string; applications: number; approvals: number }[];
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-muted font-medium uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}

export function EnrolmentsReport({ params }: { params: string }) {
  const { data, isLoading } = useQuery<EnrolmentsData>({
    queryKey: ["report-enrolments", params],
    queryFn: () => fetchApi(`/api/reports/enrolments?${params}`),
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
        <StatCard label="Total Applications" value={data.totalApplications} />
        <StatCard label="Approved" value={data.byStatus.approved ?? 0} />
        <StatCard label="Declined" value={data.byStatus.declined ?? 0} />
        <StatCard label="Approval Rate" value={`${data.approvalRate}%`} />
        <StatCard label="Avg Approval Time" value={`${data.averageApprovalTimeHours}h`} />
      </div>

      {/* Monthly bar chart */}
      {data.byMonth.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Applications by Month</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="applications" fill="#004E64" name="Applications" radius={[4, 4, 0, 0]} />
              <Bar dataKey="approvals" fill="#FECE00" name="Approvals" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By service table */}
      {data.byService.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">By Service</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface border-b border-border">
                  <th className="text-left px-4 py-2 font-medium text-muted">Service</th>
                  <th className="text-right px-4 py-2 font-medium text-muted">Total</th>
                  <th className="text-right px-4 py-2 font-medium text-muted">Approved</th>
                  <th className="text-right px-4 py-2 font-medium text-muted">Declined</th>
                  <th className="text-right px-4 py-2 font-medium text-muted">Pending</th>
                </tr>
              </thead>
              <tbody>
                {data.byService.map((s) => (
                  <tr key={s.serviceName} className="border-b border-border">
                    <td className="px-4 py-2 text-foreground">{s.serviceName}</td>
                    <td className="px-4 py-2 text-right">{s.total}</td>
                    <td className="px-4 py-2 text-right text-emerald-600">{s.approved}</td>
                    <td className="px-4 py-2 text-right text-red-600">{s.declined}</td>
                    <td className="px-4 py-2 text-right text-amber-600">{s.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
