"use client";

/**
 * L10 Scorecard review — trailing-weeks grid.
 *
 * 2026-07-28, per Daniel (with a reference screenshot): the review used to
 * be one card per measurable showing only the current week, which lost all
 * sense of trend. It's now the standard EOS scorecard grid:
 *
 *   MEASURABLE | GOAL | OWNER | 13WK AVG | <4 most recent weeks>
 *
 * Weeks run most-recent-first. Values are red when the goal was missed and
 * green when it was hit, so scanning down a column shows a bad week and
 * along a row shows a struggling measurable.
 *
 * Data note: /api/scorecard already returns `take: 13` entries per
 * measurable ordered by weekOf desc, so both the visible weeks and the
 * 13-week average come from what we already fetch — no API change.
 *
 * Preserved from the old layout: clicking the current week's cell edits
 * that entry inline, and an off-track measurable can still be dropped
 * into IDS.
 */

import { useState, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import type { ScorecardData, MeasurableData } from "@/hooks/useScorecard";
import { cn } from "@/lib/utils";

/** How many trailing weeks to show as columns. */
const WEEKS_SHOWN = 4;

/** "JUL 20-26" — the Mon-Sun span of the week starting at `weekOf`. */
function weekLabel(weekOfIso: string): string {
  const start = new Date(weekOfIso);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startMon = start
    .toLocaleDateString("en-AU", { month: "short" })
    .toUpperCase();
  const endMon = end
    .toLocaleDateString("en-AU", { month: "short" })
    .toUpperCase();
  return startMon === endMon
    ? `${startMon} ${start.getDate()}-${end.getDate()}`
    : `${startMon} ${start.getDate()} - ${endMon} ${end.getDate()}`;
}

/** Goal as "≥ 4" / "≤ 4" / "= 4". */
function goalLabel(m: MeasurableData): string {
  const symbol =
    m.goalDirection === "above" ? "≥" : m.goalDirection === "below" ? "≤" : "=";
  return `${symbol} ${m.goalValue.toLocaleString()}`;
}

/** Same on/off-track rule the server applies per entry, reused for the average. */
function meetsGoal(value: number, m: MeasurableData): boolean {
  if (m.goalDirection === "above") return value >= m.goalValue;
  if (m.goalDirection === "below") return value <= m.goalValue;
  return value === m.goalValue;
}

function initial(name: string | null | undefined): string {
  return (name ?? "?").trim().charAt(0).toUpperCase() || "?";
}

/** UTC date key so entries and column headers always line up. */
function weekKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function ScorecardSection({
  scorecard,
  onDropToIDS,
  onEntrySubmit,
  isCompleted,
}: {
  scorecard: ScorecardData | undefined;
  onDropToIDS?: (title: string) => void;
  onEntrySubmit?: (measurableId: string, value: number) => void;
  isCompleted?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const measurables = useMemo(
    () => scorecard?.measurables ?? [],
    [scorecard],
  );

  // Columns come from the union of every measurable's weeks, not from one
  // row — a measurable missing a week would otherwise shift its remaining
  // values into the wrong columns.
  const weeks = useMemo(() => {
    const seen = new Set<string>();
    for (const m of measurables) {
      for (const e of m.entries) seen.add(weekKey(e.weekOf));
    }
    return [...seen].sort((a, b) => (a < b ? 1 : -1)).slice(0, WEEKS_SHOWN);
  }, [measurables]);

  // Two genuinely different empty states: no scorecard loaded at all vs a
  // scorecard that exists but has nothing configured yet.
  if (!scorecard) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No scorecard data available
      </div>
    );
  }
  if (measurables.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No measurables configured. Add them in the Scorecard section.
      </div>
    );
  }

  const offTrackCount = measurables.filter(
    (m) => m.entries[0] && !m.entries[0].onTrack,
  ).length;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
          Weekly Scorecard
        </h4>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Last {WEEKS_SHOWN} weeks, most recent first. Discuss only what&apos;s
          off track — drop those into IDS rather than solving them here.
          {offTrackCount > 0 && (
            <span className="font-medium">
              {" "}
              {offTrackCount} off track this week.
            </span>
          )}
        </p>
      </div>

      {/* Scrolls within itself so a wide grid never pushes the page sideways. */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-medium text-muted text-2xs uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                Measurable
              </th>
              <th className="text-right font-medium text-muted text-2xs uppercase tracking-wider px-3 py-3 whitespace-nowrap">
                Goal
              </th>
              <th className="text-left font-medium text-muted text-2xs uppercase tracking-wider px-3 py-3 whitespace-nowrap">
                Owner
              </th>
              <th className="text-center font-medium text-muted text-2xs uppercase tracking-wider px-3 py-3 whitespace-nowrap bg-surface/60">
                13wk Avg
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w}
                  className={cn(
                    "text-center font-medium text-muted text-2xs uppercase tracking-wider px-3 py-3 whitespace-nowrap",
                    i === 0 && "bg-brand/5",
                  )}
                >
                  {weekLabel(w)}
                </th>
              ))}
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {measurables.map((m) => {
              const byWeek = new Map(
                m.entries.map((e) => [weekKey(e.weekOf), e]),
              );
              const avg =
                m.entries.length > 0
                  ? m.entries.reduce((sum, e) => sum + e.value, 0) /
                    m.entries.length
                  : null;
              const latest = m.entries[0];
              const showIdsAction =
                !!latest && !latest.onTrack && !!onDropToIDS && !isCompleted;

              return (
                <tr key={m.id} className="hover:bg-surface/40">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <span
                      className="block max-w-[16rem] truncate"
                      title={m.title}
                    >
                      {m.title}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-muted whitespace-nowrap">
                    {goalLabel(m)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-brand/10 text-brand text-2xs font-semibold flex items-center justify-center shrink-0">
                        {initial(m.owner?.name)}
                      </span>
                      <span className="text-foreground/80">
                        {(m.owner?.name ?? "Unassigned").split(" ")[0]}
                      </span>
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-3 text-center font-semibold tabular-nums bg-surface/60",
                      avg === null
                        ? "text-muted"
                        : meetsGoal(avg, m)
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400",
                    )}
                    title={
                      avg === null
                        ? undefined
                        : `Average of ${m.entries.length} recorded week${m.entries.length === 1 ? "" : "s"}`
                    }
                  >
                    {avg === null ? "—" : Math.round(avg).toLocaleString()}
                  </td>

                  {weeks.map((w, i) => {
                    const entry = byWeek.get(w);
                    const isCurrent = i === 0;
                    const editable = isCurrent && !isCompleted && !!onEntrySubmit;

                    if (isCurrent && editingId === m.id) {
                      const commit = () => {
                        if (editValue !== "" && onEntrySubmit) {
                          onEntrySubmit(m.id, parseFloat(editValue));
                        }
                        setEditingId(null);
                      };
                      return (
                        <td key={w} className="px-2 py-2 bg-brand/5">
                          <input
                            type="number"
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            aria-label={`${m.title} value for ${weekLabel(w)}`}
                            className="w-20 px-2 py-1 text-center text-sm border border-brand rounded bg-card focus:outline-none focus:ring-2 focus:ring-brand/30"
                          />
                        </td>
                      );
                    }

                    return (
                      <td
                        key={w}
                        onClick={() => {
                          if (!editable) return;
                          setEditingId(m.id);
                          setEditValue(entry ? String(entry.value) : "");
                        }}
                        title={
                          editable ? "Click to update this week" : undefined
                        }
                        className={cn(
                          "px-3 py-3 text-center font-semibold tabular-nums",
                          isCurrent && "bg-brand/5",
                          editable && "cursor-pointer hover:bg-brand/10",
                          !entry
                            ? "text-muted/50"
                            : entry.onTrack
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400",
                        )}
                      >
                        {entry ? entry.value.toLocaleString() : "—"}
                      </td>
                    );
                  })}

                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {showIdsAction && onDropToIDS ? (
                      <button
                        onClick={() => onDropToIDS(`Off-track: ${m.title}`)}
                        className="inline-flex items-center gap-1 text-2xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        title="Add this to the IDS list"
                      >
                        <AlertCircle className="w-3 h-3" />
                        IDS
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
