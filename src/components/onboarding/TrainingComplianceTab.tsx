"use client";

import { AlertTriangle, Clock, Download, ShieldCheck, Users } from "lucide-react";
import {
  useTrainingCompliance,
  type ComplianceUserRow,
} from "@/hooks/useLMS";
import { exportToCsv, formatDateCSV } from "@/lib/csv-export";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusChip } from "@/components/ui/StatusChip";

function fmtDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}

function StatCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof AlertTriangle;
  value: number;
  label: string;
  tone: "red" | "amber" | "blue";
}) {
  const tones = {
    red: "text-red-600 bg-red-50 dark:bg-red-500/10",
    amber: "text-amber-600 bg-amber-50 dark:bg-amber-500/10",
    blue: "text-brand bg-brand/5",
  } as const;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function StaffRow({ row }: { row: ComplianceUserRow }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
          <p className="truncate text-xs text-muted">{row.email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.overdueCount > 0 && (
            <StatusChip level="now">{row.overdueCount} overdue</StatusChip>
          )}
          <StatusChip level="queue">{row.outstanding.length} outstanding</StatusChip>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {row.outstanding.map((c) => (
          <li
            key={c.courseId}
            className="flex items-center justify-between gap-3 rounded-md bg-surface/50 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{c.courseTitle}</p>
              <p className="text-[11px] text-muted capitalize">
                {c.track} · {c.progressPct}% complete
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] text-muted whitespace-nowrap">
                Due {fmtDate(c.dueDate)}
              </span>
              {c.overdue ? (
                <StatusChip level="now">Overdue</StatusChip>
              ) : c.dueSoon ? (
                <StatusChip level="soon">Due soon</StatusChip>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Admin "who's behind on required training" view — the counterpart to the
 * weekly training-reminders cron. Groups outstanding essential/monthly-track
 * courses by staff member, overdue first, with a CSV export.
 */
export function TrainingComplianceTab() {
  const { data, isLoading, isError, error } = useTrainingCompliance();

  const handleExport = () => {
    if (!data) return;
    const flat = data.rows.flatMap((r) =>
      r.outstanding.map((c) => ({ r, c })),
    );
    exportToCsv("training-compliance", flat, [
      { header: "Staff Member", accessor: ({ r }) => r.name },
      { header: "Email", accessor: ({ r }) => r.email },
      { header: "Role", accessor: ({ r }) => r.role },
      { header: "Course", accessor: ({ c }) => c.courseTitle },
      { header: "Track", accessor: ({ c }) => c.track },
      { header: "Progress %", accessor: ({ c }) => c.progressPct },
      {
        header: "Due Date",
        accessor: ({ c }) => (c.dueDate ? formatDateCSV(c.dueDate) : ""),
      },
      {
        header: "Status",
        accessor: ({ c }) => (c.overdue ? "Overdue" : c.dueSoon ? "Due soon" : "Outstanding"),
      },
    ]);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600 dark:bg-red-500/10">
        Couldn&apos;t load training compliance{error instanceof Error ? `: ${error.message}` : "."}
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-10 text-center dark:bg-emerald-500/10">
        <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500" />
        <p className="mt-3 text-sm font-semibold text-foreground">
          Everyone&apos;s up to date on required training 🎉
        </p>
        <p className="mt-1 text-xs text-muted">
          No overdue or outstanding essential/monthly courses across active staff.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Staff with outstanding required training (essential &amp; monthly tracks), most behind first.
        </p>
        <button
          onClick={handleExport}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={AlertTriangle} value={data.totals.overdueCourses} label="Overdue courses" tone="red" />
        <StatCard icon={Clock} value={data.totals.outstandingCourses} label="Outstanding courses" tone="amber" />
        <StatCard icon={Users} value={data.totals.staffBehind} label="Staff behind" tone="blue" />
      </div>

      <div className="space-y-3">
        {data.rows.map((row) => (
          <StaffRow key={row.userId} row={row} />
        ))}
      </div>
    </div>
  );
}
