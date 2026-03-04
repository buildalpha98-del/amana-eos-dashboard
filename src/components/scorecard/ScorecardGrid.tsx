"use client";

import { useMemo, Fragment } from "react";
import type { ScorecardData, MeasurableEntry } from "@/hooks/useScorecard";
import { DataEntryCell } from "./DataEntryCell";
import { getWeekStart } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function TrendArrow({ values, goalDirection }: { values: (number | null)[]; goalDirection: "above" | "below" | "exact" }) {
  // values are newest-first; find the two most recent non-null values
  const recent = values.filter((v): v is number => v !== null);
  if (recent.length < 2) return <span className="text-gray-300 text-[10px]">—</span>;

  const latest = recent[0];
  const prev = recent[1];
  const diff = latest - prev;
  const pct = prev !== 0 ? Math.abs(diff / prev) * 100 : 0;

  // "improving" depends on goalDirection
  const isImproving = goalDirection === "below" ? diff < 0 : diff > 0;
  const isFlat = Math.abs(diff) < 0.001 || pct < 1;

  if (isFlat) {
    return (
      <span className="inline-flex items-center gap-0.5 text-gray-400" title="Flat vs previous week">
        <Minus className="w-3 h-3" />
      </span>
    );
  }

  if (isImproving) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600" title={`+${pct.toFixed(0)}% vs previous week`}>
        <TrendingUp className="w-3 h-3" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 text-red-500" title={`-${pct.toFixed(0)}% vs previous week`}>
      <TrendingDown className="w-3 h-3" />
    </span>
  );
}

function Sparkline({ values, goalValue, width = 64, height = 20 }: { values: (number | null)[]; goalValue: number; width?: number; height?: number }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <span className="text-gray-300 text-[10px]">—</span>;

  const min = Math.min(...nums, goalValue);
  const max = Math.max(...nums, goalValue);
  const range = max - min || 1;
  const pad = 2;

  // Reverse so oldest is on the left
  const reversed = [...values].reverse();
  const points: string[] = [];
  let idx = 0;
  for (let i = 0; i < reversed.length; i++) {
    if (reversed[i] !== null) {
      const x = pad + ((i / (reversed.length - 1)) * (width - pad * 2));
      const y = pad + ((1 - (reversed[i]! - min) / range) * (height - pad * 2));
      points.push(`${x},${y}`);
      idx++;
    }
  }

  const goalY = pad + ((1 - (goalValue - min) / range) * (height - pad * 2));
  const lastVal = nums[nums.length - 1];
  const trending = lastVal >= goalValue;

  return (
    <svg width={width} height={height} className="inline-block">
      {/* Goal line */}
      <line x1={pad} y1={goalY} x2={width - pad} y2={goalY} stroke="#9CA3AF" strokeWidth="0.5" strokeDasharray="2,2" />
      {/* Trend line */}
      <polyline
        fill="none"
        stroke={trending ? "#10B981" : "#EF4444"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}

function getTrailing13Weeks(): Date[] {
  const weeks: Date[] = [];
  const current = getWeekStart();
  // Newest first — current week at index 0
  for (let i = 0; i <= 12; i++) {
    const d = new Date(current);
    d.setDate(d.getDate() - i * 7);
    weeks.push(d);
  }
  return weeks;
}

function formatWeekShort(date: Date): string {
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function isCurrentWeek(date: Date): boolean {
  const current = getWeekStart();
  return date.getTime() === current.getTime();
}

export function ScorecardGrid({ scorecard }: { scorecard: ScorecardData }) {
  const weeks = useMemo(() => getTrailing13Weeks(), []);

  // Group measurables by owner
  const grouped = useMemo(() => {
    const groups: Record<
      string,
      { owner: { id: string; name: string }; measurables: typeof scorecard.measurables }
    > = {};

    for (const m of scorecard.measurables) {
      if (!groups[m.ownerId]) {
        groups[m.ownerId] = {
          owner: { id: m.owner.id, name: m.owner.name },
          measurables: [],
        };
      }
      groups[m.ownerId].measurables.push(m);
    }

    return Object.values(groups).sort((a, b) =>
      a.owner.name.localeCompare(b.owner.name)
    );
  }, [scorecard.measurables]);

  // Build entry lookup: measurableId -> weekIso -> entry
  const entryLookup = useMemo(() => {
    const lookup: Record<string, Record<string, MeasurableEntry>> = {};
    for (const m of scorecard.measurables) {
      lookup[m.id] = {};
      for (const e of m.entries) {
        const weekKey = new Date(e.weekOf).toISOString().split("T")[0];
        lookup[m.id][weekKey] = e;
      }
    }
    return lookup;
  }, [scorecard.measurables]);

  // 13-week average per measurable
  const avgLookup = useMemo(() => {
    const avgs: Record<string, number | null> = {};
    for (const m of scorecard.measurables) {
      const entries = weeks
        .map((w) => entryLookup[m.id]?.[w.toISOString().split("T")[0]])
        .filter((e): e is MeasurableEntry => !!e);
      if (entries.length > 0) {
        const sum = entries.reduce((acc, e) => acc + e.value, 0);
        avgs[m.id] = Math.round((sum / entries.length) * 10) / 10;
      } else {
        avgs[m.id] = null;
      }
    }
    return avgs;
  }, [scorecard.measurables, weeks, entryLookup]);

  // On-track stats for current week
  const currentWeekStats = useMemo(() => {
    const currentWeek = getWeekStart();
    const weekKey = currentWeek.toISOString().split("T")[0];
    let onTrack = 0;
    let total = 0;

    for (const m of scorecard.measurables) {
      const entry = entryLookup[m.id]?.[weekKey];
      if (entry) {
        total++;
        if (entry.onTrack) onTrack++;
      }
    }

    return { onTrack, total, measurables: scorecard.measurables.length };
  }, [scorecard.measurables, entryLookup]);

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="flex items-center gap-4 px-1">
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">
            {scorecard.measurables.length}
          </span>{" "}
          Measurables
        </span>
        <span className="text-gray-300">|</span>
        {currentWeekStats.total > 0 ? (
          <>
            <span className="text-sm text-emerald-600">
              {currentWeekStats.onTrack}/{currentWeekStats.total} on track this
              week
            </span>
            <span className="text-sm text-gray-400 ml-auto">
              {currentWeekStats.measurables - currentWeekStats.total} not yet
              entered
            </span>
          </>
        ) : (
          <span className="text-sm text-gray-400">
            No data entered this week yet
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 sm:mx-0 scrollbar-thin">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[200px]">
                Measurable
              </th>
              <th className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-[60px]">
                Goal
              </th>
              <th className="px-2 py-3 text-center text-xs font-semibold text-[#004E64] uppercase tracking-wider w-[70px] bg-[#004E64]/5">
                13wk Avg
              </th>
              <th className="px-1 py-3 text-center text-[10px] font-medium text-gray-400 uppercase tracking-wider w-[72px]">
                Trend
              </th>
              {weeks.map((week) => {
                const isCurrent = isCurrentWeek(week);
                return (
                  <th
                    key={week.toISOString()}
                    className={cn(
                      "px-1 py-3 text-center text-[10px] font-medium w-[70px]",
                      isCurrent
                        ? "text-[#004E64] bg-[#004E64]/5 font-semibold"
                        : "text-gray-400"
                    )}
                  >
                    {formatWeekShort(week)}
                    {isCurrent && (
                      <div className="text-[8px] text-[#004E64] font-bold mt-0.5">
                        THIS WEEK
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <Fragment key={group.owner.id}>
                {/* Owner divider */}
                <tr>
                  <td
                    colSpan={weeks.length + 4}
                    className="sticky left-0 z-10 bg-gray-50 px-4 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#004E64]/10 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-[#004E64]">
                          {group.owner.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-gray-600">
                        {group.owner.name}
                      </span>
                    </div>
                  </td>
                </tr>

                {/* Measurable rows */}
                {group.measurables.map((m) => {
                  const avg = avgLookup[m.id];
                  const avgOnTrack = avg !== null && avg !== undefined
                    ? m.goalDirection === "above"
                      ? avg >= m.goalValue
                      : m.goalDirection === "below"
                      ? avg <= m.goalValue
                      : avg === m.goalValue
                    : false;

                  const fmtVal = (val: number) => {
                    if (m.unit === "$") return `$${val.toLocaleString()}`;
                    if (m.unit === "%") return `${val}%`;
                    return val.toLocaleString();
                  };

                  return (
                  <tr
                    key={m.id}
                    className="border-b border-gray-100 hover:bg-gray-50/50"
                  >
                    {/* Title */}
                    <td className="sticky left-0 z-10 bg-white px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="text-sm font-medium text-gray-900 truncate max-w-[160px]">
                          {m.title}
                        </div>
                        <TrendArrow
                          values={weeks.map((w) => {
                            const e = entryLookup[m.id]?.[w.toISOString().split("T")[0]];
                            return e ? e.value : null;
                          })}
                          goalDirection={m.goalDirection}
                        />
                      </div>
                      {m.description && (
                        <div className="text-[10px] text-gray-400 truncate max-w-[180px]">
                          {m.description}
                        </div>
                      )}
                    </td>

                    {/* Goal */}
                    <td className="px-2 py-2 text-center">
                      <span className="text-xs text-gray-500 font-medium">
                        {m.goalDirection === "above"
                          ? "≥"
                          : m.goalDirection === "below"
                          ? "≤"
                          : "="}
                        {" "}
                        {m.unit === "$"
                          ? `$${m.goalValue.toLocaleString()}`
                          : m.unit === "%"
                          ? `${m.goalValue}%`
                          : m.goalValue.toLocaleString()}
                      </span>
                    </td>

                    {/* 13-week Average */}
                    <td
                      className={cn(
                        "px-2 py-2 text-center bg-[#004E64]/5",
                        avg !== null && avg !== undefined
                          ? avgOnTrack
                            ? "text-emerald-700"
                            : "text-red-700"
                          : "text-gray-300"
                      )}
                    >
                      <span className="text-xs font-semibold">
                        {avg !== null && avg !== undefined ? fmtVal(avg) : "—"}
                      </span>
                    </td>

                    {/* Sparkline */}
                    <td className="px-1 py-2 text-center">
                      <Sparkline
                        values={weeks.map((w) => {
                          const e = entryLookup[m.id]?.[w.toISOString().split("T")[0]];
                          return e ? e.value : null;
                        })}
                        goalValue={m.goalValue}
                      />
                    </td>

                    {/* Week cells */}
                    {weeks.map((week) => {
                      const weekKey = week.toISOString().split("T")[0];
                      const entry = entryLookup[m.id]?.[weekKey];
                      return (
                        <DataEntryCell
                          key={`${m.id}-${weekKey}`}
                          measurableId={m.id}
                          weekOf={week.toISOString()}
                          entry={entry}
                          unit={m.unit}
                          goalValue={m.goalValue}
                          goalDirection={m.goalDirection}
                        />
                      );
                    })}
                  </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
