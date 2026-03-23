"use client";

import { useState, useMemo } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  HelpCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  useAutomationStatus,
  type AutomationTask,
  type AutomationSeat,
} from "@/hooks/useAutomations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatReportType(reportType: string): string {
  return reportType
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const HEALTH_CONFIG = {
  green: {
    label: "Healthy",
    icon: CheckCircle2,
    textColor: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    dotColor: "bg-emerald-500",
  },
  amber: {
    label: "Attention",
    icon: AlertTriangle,
    textColor: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    dotColor: "bg-amber-500",
  },
  red: {
    label: "Critical",
    icon: XCircle,
    textColor: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    dotColor: "bg-red-500",
  },
  never_run: {
    label: "Never Run",
    icon: HelpCircle,
    textColor: "text-muted",
    bgColor: "bg-surface",
    borderColor: "border-border",
    dotColor: "bg-gray-400",
  },
} as const;

const TIME_RANGES = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  icon: Icon,
  textColor,
  bgColor,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  textColor: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-warm-sm)]">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <div className={`rounded-lg p-2 ${bgColor}`}>
          <Icon className={`w-4 h-4 ${textColor}`} />
        </div>
      </div>
      <p className={`mt-2 text-2xl font-bold ${textColor}`}>{value}</p>
    </div>
  );
}

function HealthBadge({ health }: { health: string }) {
  const config = HEALTH_CONFIG[health as keyof typeof HEALTH_CONFIG] ?? HEALTH_CONFIG.never_run;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor} border ${config.borderColor}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function HealthBar({ seat }: { seat: AutomationSeat }) {
  const total = seat.taskCount;
  if (total === 0) return null;
  const segments = [
    { count: seat.green, color: "bg-emerald-500" },
    { count: seat.amber, color: "bg-amber-500" },
    { count: seat.red, color: "bg-red-500" },
    { count: seat.neverRun, color: "bg-gray-300" },
  ];
  return (
    <div className="flex w-full h-2 rounded-full overflow-hidden bg-surface">
      {segments.map((seg, i) =>
        seg.count > 0 ? (
          <div
            key={i}
            className={`${seg.color} transition-all`}
            style={{ width: `${(seg.count / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function TaskRow({ task }: { task: AutomationTask }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors">
      <td className="py-3 px-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">
            {task.lastTitle ?? formatReportType(task.reportType)}
          </span>
          <span className="text-xs text-muted">{task.reportType}</span>
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-muted" />
          <span className="text-sm text-foreground">
            {timeAgo(task.lastRunAt)}
          </span>
        </div>
      </td>
      <td className="py-3 px-4">
        <HealthBadge health={task.health} />
      </td>
      <td className="py-3 px-4 text-sm text-foreground text-center">
        {task.runCount}
      </td>
      <td className="py-3 px-4 text-sm text-muted">
        {task.expectedIntervalHours < 24
          ? `~${Math.round(task.expectedIntervalHours)}h cycle`
          : `~${Math.round(task.expectedIntervalHours / 24)}d cycle`}
      </td>
    </tr>
  );
}

function SeatSection({ seat }: { seat: AutomationSeat }) {
  const [open, setOpen] = useState(seat.red > 0 || seat.amber > 0);

  return (
    <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-warm-sm)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted shrink-0" />
        )}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">
              {seat.label}
            </span>
            <span className="text-xs text-muted">
              {seat.taskCount} task{seat.taskCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="mt-2 max-w-xs">
            <HealthBar seat={seat} />
          </div>
        </div>
        {/* Quick counts */}
        <div className="flex items-center gap-3 shrink-0">
          {seat.green > 0 && (
            <span className="text-xs text-emerald-600 font-medium">
              {seat.green} ok
            </span>
          )}
          {seat.amber > 0 && (
            <span className="text-xs text-amber-600 font-medium">
              {seat.amber} late
            </span>
          )}
          {seat.red > 0 && (
            <span className="text-xs text-red-600 font-medium">
              {seat.red} critical
            </span>
          )}
        </div>
      </button>

      {/* Task table */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-t border-border bg-surface/50">
                <th className="py-2 px-4 text-xs font-medium text-muted uppercase tracking-wider">
                  Task
                </th>
                <th className="py-2 px-4 text-xs font-medium text-muted uppercase tracking-wider">
                  Last Run
                </th>
                <th className="py-2 px-4 text-xs font-medium text-muted uppercase tracking-wider">
                  Health
                </th>
                <th className="py-2 px-4 text-xs font-medium text-muted uppercase tracking-wider text-center">
                  Runs
                </th>
                <th className="py-2 px-4 text-xs font-medium text-muted uppercase tracking-wider">
                  Cadence
                </th>
              </tr>
            </thead>
            <tbody>
              {seat.tasks.map((task) => (
                <TaskRow key={task.taskKey} task={task} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card p-4"
        >
          <Skeleton className="h-4 w-20 mb-3" />
          <Skeleton className="h-8 w-12" />
        </div>
      ))}
    </div>
  );
}

function SeatsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-2 w-48 mt-3" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent activity feed
// ---------------------------------------------------------------------------

function RecentActivityFeed({ seats }: { seats: AutomationSeat[] }) {
  const recentRuns = useMemo(() => {
    const all: AutomationTask[] = [];
    for (const seat of seats) {
      for (const task of seat.tasks) {
        if (task.lastRunAt) all.push(task);
      }
    }
    all.sort((a, b) => {
      const da = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
      const db = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
      return db - da;
    });
    return all.slice(0, 20);
  }, [seats]);

  if (recentRuns.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-warm-sm)]">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-brand" />
          Recent Activity
        </h3>
      </div>
      <div className="divide-y divide-border">
        {recentRuns.map((task) => {
          const config =
            HEALTH_CONFIG[task.health as keyof typeof HEALTH_CONFIG] ??
            HEALTH_CONFIG.never_run;
          return (
            <div
              key={task.taskKey}
              className="flex items-center gap-3 px-5 py-3"
            >
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${config.dotColor}`}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground truncate block">
                  {task.lastTitle ?? formatReportType(task.reportType)}
                </span>
              </div>
              <span className="text-xs text-muted shrink-0">
                {timeAgo(task.lastRunAt)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AutomationsPage() {
  const [timeRange, setTimeRange] = useState("7d");
  const { data, isLoading, isError } = useAutomationStatus(timeRange);

  const criticalCount = data?.summary.red ?? 0;

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Monitor the health and cadence of all automated tasks"
      />

      {/* Alert banner for critical tasks */}
      {criticalCount > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            {criticalCount} automation{criticalCount !== 1 ? "s" : ""} need
            attention &mdash; overdue by 2+ expected cycles
          </p>
        </div>
      )}

      {/* Time range toggle */}
      <div className="mb-6 flex items-center gap-2">
        <span className="text-sm text-muted mr-1">Time range:</span>
        <div className="flex items-center bg-surface rounded-lg p-0.5">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setTimeRange(tr.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                timeRange === tr.value
                  ? "bg-card text-brand shadow-[var(--shadow-warm-sm)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <SummarySkeleton />
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">
            Failed to load automation status. Please try again.
          </p>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <SummaryCard
              label="Total Tasks"
              value={data.summary.total}
              icon={Activity}
              textColor="text-brand"
              bgColor="bg-accent/10"
            />
            <SummaryCard
              label="Healthy"
              value={data.summary.green}
              icon={CheckCircle2}
              textColor="text-emerald-600"
              bgColor="bg-emerald-50"
            />
            <SummaryCard
              label="Attention"
              value={data.summary.amber}
              icon={AlertTriangle}
              textColor="text-amber-600"
              bgColor="bg-amber-50"
            />
            <SummaryCard
              label="Critical"
              value={data.summary.red}
              icon={XCircle}
              textColor="text-red-600"
              bgColor="bg-red-50"
            />
          </div>

          {/* Seat sections */}
          {data.seats.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No automations found"
              description={`No automation reports recorded in the last ${timeRange}. Cowork automations will appear here as they run.`}
            />
          ) : (
            <div className="space-y-4 mb-8">
              {data.seats.map((seat) => (
                <SeatSection key={seat.seat} seat={seat} />
              ))}
            </div>
          )}

          {/* Recent activity feed */}
          <RecentActivityFeed seats={data.seats} />
        </>
      ) : null}
    </div>
  );
}
