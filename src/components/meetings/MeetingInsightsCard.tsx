"use client";

import { useMemo } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { MeetingData } from "@/hooks/useMeetings";

/**
 * L10 health trends (execution layer, 2026-08-31).
 *
 * Renders three sparklines over the last 12 completed meetings that carry
 * an outcomes SNAPSHOT (pre-snapshot history is excluded — it can't trend
 * honestly because those numbers recompute from live data). Appears only
 * once ≥3 snapshots exist.
 */

interface Point {
  rating: number | null;
  completionPct: number;
  issuesSolved: number;
}

function Sparkline({
  values,
  label,
  latestLabel,
  delta,
}: {
  values: number[];
  label: string;
  latestLabel: string;
  delta: number | null;
}) {
  const width = 120;
  const height = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaClass =
    delta === null || delta === 0
      ? "text-muted"
      : delta > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="flex-1 min-w-0 p-3 rounded-lg bg-surface/50">
      <p className="text-2xs font-semibold text-muted uppercase tracking-wider mb-1">
        {label}
      </p>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-lg font-bold text-foreground">{latestLabel}</span>
          <span className={`ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium ${deltaClass}`}>
            <DeltaIcon className="w-3 h-3" />
            {delta === null ? "—" : Math.abs(Math.round(delta * 10) / 10)}
          </span>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-[120px] h-8 flex-shrink-0"
          aria-hidden="true"
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-brand"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

export function MeetingInsightsCard({ meetings }: { meetings: MeetingData[] }) {
  const points = useMemo<Point[]>(() => {
    return meetings
      .filter((m) => m.status === "completed" && m.outcomes)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-12)
      .map((m) => ({
        rating: m.outcomes!.avgRating,
        completionPct: m.outcomes!.completionPct,
        issuesSolved: m.outcomes!.issuesSolvedIds?.length ?? 0,
      }));
  }, [meetings]);

  if (points.length < 3) return null;

  // Unrated meetings are excluded from the polyline rather than plotted
  // as zero (the headline already shows "—" honestly).
  const ratings = points.filter((p) => p.rating !== null).map((p) => p.rating!);
  const completion = points.map((p) => p.completionPct);
  const solved = points.map((p) => p.issuesSolved);
  const last = points[points.length - 1];
  const prev = points[points.length - 2];

  return (
    <div className="mb-6 bg-card rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        L10 health — last {points.length} meetings
      </h3>
      <div className="flex flex-col sm:flex-row gap-3">
        <Sparkline
          values={ratings.length > 0 ? ratings : [0]}
          label="Rating"
          latestLabel={last.rating !== null ? `${last.rating}/10` : "—"}
          delta={
            last.rating !== null && prev.rating !== null
              ? last.rating - prev.rating
              : null
          }
        />
        <Sparkline
          values={completion}
          label="To-do completion"
          latestLabel={`${last.completionPct}%`}
          delta={last.completionPct - prev.completionPct}
        />
        <Sparkline
          values={solved}
          label="Issues solved"
          latestLabel={String(last.issuesSolved)}
          delta={last.issuesSolved - prev.issuesSolved}
        />
      </div>
    </div>
  );
}
