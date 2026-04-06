"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Download } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";

interface AttendanceData {
  totalExpected: number;
  totalSignedIn: number;
  totalSignedOut: number;
  lateSignOuts: number;
  noShows: number;
  byDay: { date: string; expected: number; signedIn: number; signedOut: number }[];
  bySessionType: { sessionType: string; expected: number; signedIn: number }[];
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-muted font-medium uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}

export function AttendanceReport({ params }: { params: string }) {
  const { data, isLoading } = useQuery<AttendanceData>({
    queryKey: ["report-attendance", params],
    queryFn: () => fetchApi(`/api/reports/attendance?${params}`),
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
        <StatCard label="Expected" value={data.totalExpected} />
        <StatCard label="Signed In" value={data.totalSignedIn} />
        <StatCard label="Signed Out" value={data.totalSignedOut} />
        <StatCard label="No-Shows" value={data.noShows} />
        <StatCard label="Late Sign-Outs" value={data.lateSignOuts} />
      </div>

      {/* Daily line chart */}
      {data.byDay.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Daily Attendance</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="expected" stroke="#004E64" strokeDasharray="5 5" name="Expected" />
              <Line type="monotone" dataKey="signedIn" stroke="#FECE00" strokeWidth={2} name="Signed In" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Session type bar chart */}
      {data.bySessionType.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">By Session Type</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.bySessionType}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="sessionType" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="expected" fill="#004E64" name="Expected" radius={[4, 4, 0, 0]} />
              <Bar dataKey="signedIn" fill="#FECE00" name="Signed In" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Export */}
      <a
        href={`/api/reports/attendance/export?${params}`}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#004E64] text-white rounded-lg hover:bg-[#003d50] transition-colors"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </a>
    </div>
  );
}
