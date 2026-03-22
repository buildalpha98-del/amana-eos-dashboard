"use client";

import { useMemo } from "react";
import type { CentrePerformance } from "@/hooks/usePerformance";
import { MapPin, Building2, Trophy, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface RegionalRollupProps {
  centres: CentrePerformance[];
  activeState: string | null;
  onStateSelect: (state: string | null) => void;
}

interface StateGroup {
  state: string;
  centreCount: number;
  avgScore: number;
  topPerformer: string;
  topScore: number;
}

const STATE_DISPLAY: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-700";
  if (score >= 60) return "text-amber-700";
  return "text-red-700";
}

function getScoreBorderColor(score: number): string {
  if (score >= 80) return "border-emerald-200";
  if (score >= 60) return "border-amber-200";
  return "border-red-200";
}

function getScoreBgAccent(score: number): string {
  if (score >= 80) return "bg-emerald-50";
  if (score >= 60) return "bg-amber-50";
  return "bg-red-50";
}

export function RegionalRollup({
  centres,
  activeState,
  onStateSelect,
}: RegionalRollupProps) {
  const stateGroups = useMemo(() => {
    const groups = new Map<string, { scores: number[]; topScore: number; topName: string }>();

    for (const c of centres) {
      const state = c.state || "Unknown";
      if (!groups.has(state)) {
        groups.set(state, { scores: [], topScore: 0, topName: "" });
      }
      const group = groups.get(state)!;
      group.scores.push(c.score);
      if (c.score > group.topScore) {
        group.topScore = c.score;
        group.topName = c.name;
      }
    }

    const result: StateGroup[] = [];
    for (const [state, data] of groups) {
      result.push({
        state,
        centreCount: data.scores.length,
        avgScore: Math.round(
          data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length
        ),
        topPerformer: data.topName,
        topScore: data.topScore,
      });
    }

    return result.sort((a, b) => b.avgScore - a.avgScore);
  }, [centres]);

  if (stateGroups.length === 0) {
    return null;
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-base md:text-lg font-semibold text-foreground">
            Regional Overview
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Performance grouped by state. Click to filter the leaderboard.
          </p>
        </div>
        {activeState && (
          <button
            onClick={() => onStateSelect(null)}
            className="text-xs text-brand hover:text-brand/70 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-surface"
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4 md:p-6">
        {stateGroups.map((group) => {
          const isActive = activeState === group.state;
          const fullName = STATE_DISPLAY[group.state] || group.state;

          return (
            <button
              key={group.state}
              onClick={() =>
                onStateSelect(isActive ? null : group.state)
              }
              className={cn(
                "text-left rounded-xl border-2 p-4 transition-all hover:shadow-sm",
                isActive
                  ? "border-brand bg-brand/5 shadow-sm"
                  : cn("hover:border-border", getScoreBorderColor(group.avgScore)),
                !isActive && getScoreBgAccent(group.avgScore)
              )}
            >
              {/* State Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapPin
                    className={cn(
                      "w-4 h-4",
                      isActive ? "text-brand" : "text-muted"
                    )}
                  />
                  <div>
                    <p
                      className={cn(
                        "text-sm font-bold",
                        isActive ? "text-brand" : "text-foreground"
                      )}
                    >
                      {group.state}
                    </p>
                    <p className="text-[10px] text-muted leading-tight">
                      {fullName}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    "w-4 h-4 transition-transform",
                    isActive ? "text-brand rotate-90" : "text-muted/50"
                  )}
                />
              </div>

              {/* Stats */}
              <div className="space-y-2">
                {/* Avg Score */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Avg Score</span>
                  <span
                    className={cn(
                      "text-xl font-bold",
                      getScoreColor(group.avgScore)
                    )}
                  >
                    {group.avgScore}
                  </span>
                </div>

                {/* Centre Count */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    Centres
                  </span>
                  <span className="text-sm font-semibold text-foreground/80">
                    {group.centreCount}
                  </span>
                </div>

                {/* Top Performer */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Trophy className="w-3 h-3 text-accent" />
                    Top
                  </span>
                  <span
                    className="text-xs font-medium text-foreground/80 truncate max-w-[120px]"
                    title={group.topPerformer}
                  >
                    {group.topPerformer}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
