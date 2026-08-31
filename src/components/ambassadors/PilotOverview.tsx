"use client";

import { Trophy, Users, AlertTriangle, DollarSign } from "lucide-react";
import { usePilotOverview } from "@/hooks/useAmbassadors";
import { Skeleton } from "@/components/ui/Skeleton";

const ATTRIBUTION_LABELS: Record<string, string> = {
  form_field: "Named on the form",
  qr_ref: "QR / referral link",
  both: "Both",
  unknown: "Unattributed",
};

function currency(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function PilotOverview() {
  const { data, isLoading } = usePilotOverview();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const pilot = data?.pilot;
  if (!pilot) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-muted text-sm">
        No Ambassadors pilot has been set up yet.
      </div>
    );
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`text-2xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            pilot.status === "active"
              ? "bg-brand text-white"
              : pilot.status === "draft"
                ? "bg-surface text-muted border border-border"
                : "bg-surface text-muted border border-border"
          }`}
        >
          {pilot.status === "active"
            ? "Live"
            : pilot.status === "draft"
              ? "Not started"
              : "Closed"}
        </span>
        <span className="text-sm text-muted">
          {pilot.name} · {fmt(pilot.startDate)} – {fmt(pilot.endDate)}
        </span>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          label="Enrolments logged"
          value={String(pilot.totals.records)}
        />
        <StatCard
          icon={Trophy}
          label="Qualified"
          value={String(pilot.totals.qualified)}
        />
        <StatCard
          icon={AlertTriangle}
          label="Open conflicts"
          value={String(pilot.totals.conflicts)}
          highlight={pilot.totals.conflicts > 0}
        />
        <StatCard
          icon={DollarSign}
          label="Cost (gross + super)"
          value={currency(pilot.totals.gross + pilot.totals.superAmount)}
          sub={`${currency(pilot.totals.gross)} gross + ${currency(pilot.totals.superAmount)} super (12%)`}
        />
      </div>

      {/* Per-centre progress */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Centre progress — qualified enrolments vs target
        </h2>
        <div className="space-y-4">
          {pilot.centres.map((c) => {
            const pct = Math.min(
              100,
              c.target > 0 ? (c.qualifiedCount / c.target) * 100 : 0,
            );
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-sm text-foreground truncate">
                    {c.serviceName}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {c.teamBonusEarned && (
                      <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-accent text-brand">
                        $200 team pool earned
                      </span>
                    )}
                    <span className="text-sm text-muted tabular-nums">
                      {c.qualifiedCount}/{c.target}
                    </span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {c.totalRecords > c.qualifiedCount && (
                  <p className="text-2xs text-muted mt-1">
                    {c.totalRecords - c.qualifiedCount} more logged, not yet
                    qualified
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Attribution breakdown */}
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            How enrolments were attributed
          </h2>
          <div className="space-y-2">
            {Object.entries(pilot.attribution).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-muted">{ATTRIBUTION_LABELS[key] ?? key}</span>
                <span className="text-foreground font-medium tabular-nums">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard — first names only */}
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Leaderboard
          </h2>
          {pilot.leaderboard.length === 0 ? (
            <p className="text-sm text-muted">No credited enrolments yet.</p>
          ) : (
            <ol className="space-y-2">
              {pilot.leaderboard.map((e, i) => (
                <li
                  key={`${e.firstName}-${i}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-muted tabular-nums">{i + 1}.</span>
                    <span className="text-foreground">{e.firstName}</span>
                  </span>
                  <span className="text-muted tabular-nums">
                    {e.qualified} qualified · {e.total} logged
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-2xs uppercase tracking-wide font-medium">
          {label}
        </span>
      </div>
      <p
        className={`text-xl font-heading font-semibold tracking-tight ${
          highlight ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-2xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
