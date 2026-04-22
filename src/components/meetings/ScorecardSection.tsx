"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { ScorecardData, MeasurableData } from "@/hooks/useScorecard";
import { cn } from "@/lib/utils";

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

  if (!scorecard) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No scorecard data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-800 mb-1">
          Weekly Scorecard
        </h4>
        <p className="text-xs text-blue-600">
          Review whether each measurable hit its goal this week. Focus only on
          off-track items — drop them to IDS.
        </p>
      </div>

      {(() => {
        const onTrackCount = scorecard.measurables.filter(
          (m) => m.entries[0]?.onTrack
        ).length;
        const offTrackCount = scorecard.measurables.filter(
          (m) => m.entries[0] && !m.entries[0].onTrack
        ).length;
        const noDataCount = scorecard.measurables.filter(
          (m) => !m.entries[0]
        ).length;
        return (
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted">
                {onTrackCount} on track
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-xs text-muted">
                {offTrackCount} off track
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-border" />
              <span className="text-xs text-muted">
                {noDataCount} no data
              </span>
            </div>
          </div>
        );
      })()}

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr,120px,80px,80px,60px,60px] gap-px bg-surface text-xs font-medium text-muted px-4 py-2">
          <span>Measurable</span>
          <span className="text-center">Owner</span>
          <span className="text-center">Goal</span>
          <span className="text-center">Actual</span>
          <span className="text-center">Status</span>
          <span className="text-center">Action</span>
        </div>
        <div className="divide-y divide-border/50">
          {scorecard.measurables.map((m: MeasurableData, idx: number) => {
            const latestEntry = m.entries[0];
            const isOnTrack = latestEntry?.onTrack;

            return (
              <div
                key={m.id}
                className={cn(
                  "grid grid-cols-[1fr,120px,80px,80px,60px,60px] gap-px px-4 py-2.5 items-center",
                  !isOnTrack && latestEntry
                    ? "bg-red-50/50"
                    : idx % 2 === 1
                      ? "bg-surface/30"
                      : ""
                )}
              >
                <span className="text-sm text-foreground truncate">
                  {m.title}
                </span>
                <span className="text-xs text-muted text-center truncate">
                  {(m.owner?.name ?? "Unassigned").split(" ")[0]}
                </span>
                <span className="text-xs text-muted text-center font-mono">
                  {m.goalDirection === "above"
                    ? ">="
                    : m.goalDirection === "below"
                      ? "<="
                      : "="}{" "}
                  {m.goalValue}
                  {m.unit ? ` ${m.unit}` : ""}
                </span>
                <div className="flex justify-center">
                  {editingId === m.id ? (
                    <input
                      autoFocus
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => {
                        if (
                          editValue &&
                          !isNaN(parseFloat(editValue)) &&
                          onEntrySubmit
                        ) {
                          onEntrySubmit(m.id, parseFloat(editValue));
                        }
                        setEditingId(null);
                        setEditValue("");
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          editValue &&
                          !isNaN(parseFloat(editValue)) &&
                          onEntrySubmit
                        ) {
                          onEntrySubmit(m.id, parseFloat(editValue));
                          setEditingId(null);
                          setEditValue("");
                        }
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setEditValue("");
                        }
                      }}
                      className="w-16 text-xs text-center border border-brand rounded px-1 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        if (!isCompleted && onEntrySubmit) {
                          setEditingId(m.id);
                          setEditValue(
                            latestEntry ? String(latestEntry.value) : ""
                          );
                        }
                      }}
                      disabled={isCompleted || !onEntrySubmit}
                      className={cn(
                        "text-xs font-mono font-semibold px-2 py-0.5 rounded transition-colors",
                        !isCompleted && onEntrySubmit
                          ? "hover:bg-brand/10 cursor-pointer"
                          : "",
                        !latestEntry
                          ? "text-muted/50"
                          : isOnTrack
                            ? "text-emerald-600"
                            : "text-red-600"
                      )}
                    >
                      {latestEntry
                        ? `${latestEntry.value}${m.unit ? ` ${m.unit}` : ""}`
                        : "--"}
                    </button>
                  )}
                </div>
                <div className="flex justify-center">
                  {!latestEntry ? (
                    <span className="text-muted/50 text-xs">--</span>
                  ) : isOnTrack ? (
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="flex justify-center">
                  {!isOnTrack && latestEntry && onDropToIDS ? (
                    <button
                      onClick={() => onDropToIDS(`Off-track: ${m.title}`)}
                      className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium whitespace-nowrap"
                    >
                      → IDS
                    </button>
                  ) : (
                    <span className="text-muted/50 text-xs">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {scorecard.measurables.length === 0 && (
        <p className="text-center text-sm text-muted py-8">
          No measurables configured. Add them in the Scorecard section.
        </p>
      )}
    </div>
  );
}
