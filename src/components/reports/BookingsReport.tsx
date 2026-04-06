"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface BookingsData {
  totalBookings: number;
  byStatus: Record<string, number>;
  bySessionType: Record<string, number>;
  casualVsPermanent: { casual: number; permanent: number };
  averageApprovalTimeHours: number;
}

const PIE_COLORS = ["#004E64", "#FECE00", "#ef4444", "#94a3b8"];

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-muted font-medium uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}

export function BookingsReport({ params }: { params: string }) {
  const { data, isLoading } = useQuery<BookingsData>({
    queryKey: ["report-bookings", params],
    queryFn: () => fetchApi(`/api/reports/bookings?${params}`),
    retry: 2,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const statusData = Object.entries(data.byStatus)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Bookings" value={data.totalBookings} />
        <StatCard label="Casual" value={data.casualVsPermanent.casual} />
        <StatCard label="Permanent" value={data.casualVsPermanent.permanent} />
        <StatCard label="Avg Approval Time" value={`${data.averageApprovalTimeHours}h`} />
      </div>

      {/* Status pie chart */}
      {statusData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Booking Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {statusData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Session type breakdown */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">By Session Type</h3>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(data.bySessionType).map(([type, count]) => (
            <div key={type} className="text-center p-3 bg-surface rounded-lg">
              <p className="text-lg font-bold text-foreground">{count}</p>
              <p className="text-xs text-muted">{type}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
