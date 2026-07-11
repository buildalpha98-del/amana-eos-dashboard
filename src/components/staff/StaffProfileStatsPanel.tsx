"use client";

/**
 * StaffProfileStatsPanel — at-a-glance "Snapshot" panel that lives in
 * the right gutter of the new long-scroll staff profile (PR 3 of the
 * Teams tab redesign). Renders five blocks: tenure, next shift,
 * active rocks, open todos, compliance counts.
 *
 * 2026-05-04: introduced (spec PR #77).
 */

import {
  CalendarClock,
  Clock,
  Mountain,
  CheckSquare,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import type { SnapshotStats } from "@/lib/staff/snapshot-stats";
import { cn } from "@/lib/utils";

export interface StaffProfileStatsPanelProps {
  stats: SnapshotStats;
}

export function StaffProfileStatsPanel({ stats }: StaffProfileStatsPanelProps) {
  return (
    <aside
      className="rounded-xl border border-border bg-card p-5 space-y-5"
      data-testid="staff-profile-stats-panel"
      aria-label="Staff snapshot"
    >
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Snapshot
        </p>
      </header>

      <StatBlock
        icon={<Clock className="h-4 w-4 text-muted" />}
        label="Tenure"
        value={stats.tenure}
      />

      <StatBlock
        icon={<CalendarClock className="h-4 w-4 text-muted" />}
        label="Next shift"
        value={stats.nextShiftLabel ?? "No upcoming shift"}
        muted={stats.nextShiftLabel === null}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatBlock
          icon={<Mountain className="h-4 w-4 text-muted" />}
          label="Active rocks"
          value={String(stats.activeRocks)}
          compact
        />
        <StatBlock
          icon={<CheckSquare className="h-4 w-4 text-muted" />}
          label="Open todos"
          value={String(stats.openTodos)}
          compact
        />
      </div>

      <div className="space-y-1.5 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Compliance
        </p>
        <CertLine
          icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
          count={stats.certCounts.valid}
          label="valid"
          tone="text-foreground/80"
        />
        <CertLine
          icon={<ShieldAlert className="h-3.5 w-3.5 text-amber-600" />}
          count={stats.certCounts.expiring}
          label="expiring"
          tone={
            stats.certCounts.expiring > 0
              ? "text-amber-700 font-semibold"
              : "text-foreground/60"
          }
        />
        <CertLine
          icon={<ShieldX className="h-3.5 w-3.5 text-red-600" />}
          count={stats.certCounts.expired}
          label="expired"
          tone={
            stats.certCounts.expired > 0
              ? "text-red-700 font-semibold"
              : "text-foreground/60"
          }
        />
      </div>
    </aside>
  );
}

// ── StatBlock ───────────────────────────────────────────────────────

interface StatBlockProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  compact?: boolean;
}

function StatBlock({ icon, label, value, muted, compact }: StatBlockProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </p>
      </div>
      <p
        className={cn(
          compact ? "text-2xl font-bold" : "text-sm font-medium",
          muted ? "text-muted/70 italic" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ── CertLine ────────────────────────────────────────────────────────

interface CertLineProps {
  icon: React.ReactNode;
  count: number;
  label: string;
  tone: string;
}

function CertLine({ icon, count, label, tone }: CertLineProps) {
  return (
    <div className={cn("flex items-center gap-2 text-xs", tone)}>
      {icon}
      <span>
        <strong>{count}</strong> {label}
      </span>
    </div>
  );
}
