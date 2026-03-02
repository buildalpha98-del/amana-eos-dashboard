"use client";

import { useMemo, Fragment } from "react";
import type { ScorecardData, MeasurableEntry } from "@/hooks/useScorecard";
import { DataEntryCell } from "./DataEntryCell";
import { getWeekStart } from "@/lib/utils";
import { cn } from "@/lib/utils";

function getTrailing13Weeks(): Date[] {
  const weeks: Date[] = [];
  const current = getWeekStart();
  for (let i = 12; i >= 0; i--) {
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[200px]">
                Measurable
              </th>
              <th className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-[60px]">
                Goal
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
                    colSpan={weeks.length + 2}
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
                {group.measurables.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-gray-100 hover:bg-gray-50/50"
                  >
                    {/* Title */}
                    <td className="sticky left-0 z-10 bg-white px-4 py-2">
                      <div className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                        {m.title}
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
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
