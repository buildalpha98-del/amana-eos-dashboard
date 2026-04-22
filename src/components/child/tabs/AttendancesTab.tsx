"use client";

import { useMemo, useState } from "react";
import { Download, ListChecks } from "lucide-react";
import { useChildAttendances } from "@/hooks/useChildAttendances";
import { exportToCsv } from "@/lib/csv-export";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { toast } from "@/hooks/useToast";
import type { ChildProfileRecord } from "../types";

interface AttendancesTabProps {
  child: ChildProfileRecord;
}

// UTC-safe: produce YYYY-MM-DD for the first / last day of a month.
function monthRangeUtc(year: number, monthIdx0: number): {
  from: string;
  to: string;
} {
  const firstDay = new Date(Date.UTC(year, monthIdx0, 1));
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0));
  const iso = (d: Date) => d.toISOString().split("T")[0];
  return { from: iso(firstDay), to: iso(lastDay) };
}

const SESSION_LABELS: Record<"bsc" | "asc" | "vc", string> = {
  bsc: "Before School",
  asc: "After School",
  vc: "Vacation Care",
};

const STATUS_STYLES: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  absent: "bg-rose-50 text-rose-700 border-rose-200",
  booked: "bg-sky-50 text-sky-700 border-sky-200",
};

function formatDateDisplay(iso: string): string {
  // iso is YYYY-MM-DD — build a UTC date so it doesn't drift locally
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeDisplay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatHours(value: number): string {
  return `${value.toFixed(1)} h`;
}

export function AttendancesTab({ child }: AttendancesTabProps) {
  const defaultRange = useMemo(() => {
    const now = new Date();
    return monthRangeUtc(now.getUTCFullYear(), now.getUTCMonth());
  }, []);
  const [from, setFrom] = useState<string>(defaultRange.from);
  const [to, setTo] = useState<string>(defaultRange.to);

  const query = useChildAttendances(child.id, from, to);
  const records = query.data?.records ?? [];
  const stats = query.data?.stats ?? {
    attendances: 0,
    absences: 0,
    totalFee: 0,
    totalHours: 0,
  };

  const childName =
    `${child.firstName ?? ""} ${child.surname ?? ""}`.trim() || "child";

  const handleExport = () => {
    if (records.length === 0) {
      toast({ description: "No records to export" });
      return;
    }
    const safeName = childName.toLowerCase().replace(/\s+/g, "-");
    const filename = `attendances-${safeName}-${from}-to-${to}`;
    exportToCsv(filename, records, [
      { header: "Date", accessor: (r) => r.date },
      {
        header: "Session",
        accessor: (r) => SESSION_LABELS[r.sessionType] ?? r.sessionType,
      },
      { header: "Status", accessor: (r) => r.status },
      {
        header: "Sign-in staff",
        accessor: (r) => r.signedInBy?.name ?? "",
      },
      { header: "Sign-in time", accessor: (r) => r.signInTime ?? "" },
      {
        header: "Sign-out staff",
        accessor: (r) => r.signedOutBy?.name ?? "",
      },
      { header: "Sign-out time", accessor: (r) => r.signOutTime ?? "" },
      { header: "Absence reason", accessor: (r) => r.absenceReason ?? "" },
      { header: "Notes", accessor: (r) => r.notes ?? "" },
      { header: "Fee", accessor: (r) => (r.fee !== null ? r.fee : "") },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Attendances" value={String(stats.attendances)} />
        <StatTile label="Absences" value={String(stats.absences)} />
        <StatTile label="Total Fee" value={formatCurrency(stats.totalFee)} />
        <StatTile label="Total Hours" value={formatHours(stats.totalHours)} />
      </div>

      {/* Toolbar: date range + export */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
          <label className="block sm:flex-none">
            <span className="text-xs uppercase tracking-wide text-muted">
              From
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full sm:w-auto rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
              aria-label="From date"
            />
          </label>
          <label className="block sm:flex-none">
            <span className="text-xs uppercase tracking-wide text-muted">
              To
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full sm:w-auto rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
              aria-label="To date"
            />
          </label>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleExport}
            disabled={records.length === 0 || query.isLoading}
            className="inline-flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-border text-foreground hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Results */}
      {query.isLoading ? (
        <div
          role="status"
          aria-label="Loading attendances"
          className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted"
        >
          Loading attendances…
        </div>
      ) : query.isError ? (
        <ErrorState
          title="Could not load attendances"
          error={query.error as Error | null}
          onRetry={() => query.refetch()}
        />
      ) : records.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No attendance records"
          description="Try widening the date range."
          variant="inline"
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">Session</th>
                  <th className="px-4 py-2 text-left font-medium">Sign-in</th>
                  <th className="px-4 py-2 text-left font-medium">Sign-out</th>
                  <th className="px-4 py-2 text-left font-medium">Notes</th>
                  <th className="px-4 py-2 text-right font-medium">Fee</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-surface/50">
                    <td className="px-4 py-2 text-foreground whitespace-nowrap">
                      {formatDateDisplay(r.date)}
                    </td>
                    <td className="px-4 py-2 text-foreground whitespace-nowrap">
                      {SESSION_LABELS[r.sessionType] ?? r.sessionType}
                    </td>
                    <td className="px-4 py-2 text-foreground whitespace-nowrap">
                      <div className="font-medium">
                        {r.signedInBy?.name ?? "—"}
                      </div>
                      <div className="text-xs text-muted">
                        {formatTimeDisplay(r.signInTime)}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-foreground whitespace-nowrap">
                      <div className="font-medium">
                        {r.signedOutBy?.name ?? "—"}
                      </div>
                      <div className="text-xs text-muted">
                        {formatTimeDisplay(r.signOutTime)}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-foreground max-w-[240px] truncate">
                      {r.absenceReason ?? r.notes ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-foreground text-right whitespace-nowrap">
                      {r.fee !== null ? formatCurrency(r.fee) : "—"}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          STATUS_STYLES[r.status] ??
                          "bg-surface text-foreground border-border"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
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

// ── Small presentational helpers ─────────────────────────────

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
