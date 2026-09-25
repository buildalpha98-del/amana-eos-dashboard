"use client";

/**
 * RampBoardTab — Staff Lifecycle → "90-day ramp": every open ramp across the
 * network (admin tier) with day, status, last mood, next due item and flags.
 * Rows link to the person's profile where the scorecard + checkpoints live.
 */

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Flag, Rocket } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { RAMP_MOOD_LABELS } from "@/lib/ramp/constants";
import { useRamps, type RampListRow } from "@/hooks/useRamp";

const OVERALL: Record<RampListRow["overall"], { label: string; className: string }> = {
  on_track: { label: "On track", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  needs_support: { label: "Needs support", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  at_risk: { label: "At risk", className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function RampBoardTab() {
  const [view, setView] = useState<"open" | "completed" | "ended">("open");
  const { data, isLoading, error, refetch } = useRamps(view === "open" ? undefined : view);
  const ramps = data?.ramps ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-heading font-semibold text-foreground">90-day ramp</h2>
          <p className="text-sm text-muted mt-0.5">
            Weekly check-in emails every Friday, manager checkpoints at day 30/60/90, and a probation review created automatically at close.
          </p>
        </div>
        <div className="flex gap-1 bg-surface rounded-lg p-1">
          {(["open", "completed", "ended"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md capitalize",
                view === v ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState title="Failed to load ramps" error={error as Error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : ramps.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title={view === "open" ? "No one is ramping right now" : `No ${view} ramps`}
          description="A ramp starts automatically for every new starter with a start date in the last 90 days."
          variant="inline"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-muted bg-surface">
                <th className="px-3 py-2 font-medium">Starter</th>
                <th className="px-3 py-2 font-medium">Centre</th>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last mood</th>
                <th className="px-3 py-2 font-medium">Next</th>
              </tr>
            </thead>
            <tbody>
              {ramps.map((r) => {
                const o = OVERALL[r.overall];
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface/60">
                    <td className="px-3 py-2">
                      <Link href={`/staff/${r.user.id}#section-ramp`} className="font-medium text-foreground hover:underline">
                        {r.user.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{r.user.service?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-foreground whitespace-nowrap">{Math.min(r.day, 999)} <span className="text-muted">/ 90</span></td>
                    <td className="px-3 py-2">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", o.className)}>{o.label}</span>
                      {r.recentFlags > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-2xs text-red-700 dark:text-red-300">
                          <Flag className="w-3 h-3" /> {r.recentFlags}
                        </span>
                      )}
                      {r.behind > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-2xs text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="w-3 h-3" /> {r.behind} behind
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground">{r.lastMood != null ? `${r.lastMood}/5 · ${RAMP_MOOD_LABELS[r.lastMood]}` : "—"}</td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">
                      {r.nextCheckpoint && r.nextCheckpoint.overdue ? (
                        <span className="text-amber-700 dark:text-amber-300">Day {r.nextCheckpoint.day} checkpoint overdue</span>
                      ) : r.nextCheckIn ? (
                        <>Week {r.nextCheckIn.weekNumber} check-in · {fmt(r.nextCheckIn.dueAt)}</>
                      ) : r.nextCheckpoint ? (
                        <>Day {r.nextCheckpoint.day} checkpoint · {fmt(r.nextCheckpoint.dueAt)}</>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
