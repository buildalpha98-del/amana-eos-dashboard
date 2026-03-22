"use client";

import { useMemo, useState } from "react";
import type { CentrePerformance } from "@/hooks/usePerformance";
import {
  Trophy,
  Medal,
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CentreLeaderboardProps {
  centres: CentrePerformance[];
  stateFilter?: string | null;
}

const PILLAR_KEYS = [
  { key: "financial", label: "Fin", color: "#004E64" },
  { key: "operational", label: "Ops", color: "#0077B6" },
  { key: "compliance", label: "Comp", color: "#00A896" },
  { key: "satisfaction", label: "Sat", color: "#F77F00" },
  { key: "teamCulture", label: "Team", color: "#9B5DE5" },
] as const;

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/20">
        <Trophy className="w-4 h-4 text-accent" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-border/60">
        <Medal className="w-4 h-4 text-muted" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100/60">
        <Medal className="w-4 h-4 text-amber-600" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-8 h-8">
      <span className="text-sm font-semibold text-muted">{rank}</span>
    </div>
  );
}

function PillarMiniBar({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${value}`}>
      <span className="text-[10px] text-muted w-7 text-right">{label}</span>
      <div className="w-16 h-2 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-medium text-muted w-5">{value}</span>
    </div>
  );
}

function TrendArrow({ trend }: { trend: string }) {
  if (trend === "improving") {
    return (
      <div className="flex items-center gap-1">
        <ArrowUp className="w-4 h-4 text-emerald-500" />
        <span className="text-xs text-emerald-600 font-medium">Up</span>
      </div>
    );
  }
  if (trend === "declining") {
    return (
      <div className="flex items-center gap-1">
        <ArrowDown className="w-4 h-4 text-red-500" />
        <span className="text-xs text-red-600 font-medium">Down</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Minus className="w-4 h-4 text-muted" />
      <span className="text-xs text-muted font-medium">Stable</span>
    </div>
  );
}

export function CentreLeaderboard({ centres, stateFilter }: CentreLeaderboardProps) {
  const [sortBy, setSortBy] = useState<string>("overall");

  const sortOptions = [
    { value: "overall", label: "Overall Score" },
    { value: "financial", label: "Financial" },
    { value: "operational", label: "Operational" },
    { value: "compliance", label: "Compliance" },
    { value: "satisfaction", label: "Satisfaction" },
    { value: "teamCulture", label: "Team & Culture" },
  ];

  const ranked = useMemo(() => {
    let filtered = stateFilter
      ? centres.filter((c) => c.state === stateFilter)
      : centres;

    return [...filtered].sort((a, b) => {
      if (sortBy === "overall") return b.score - a.score;
      return (
        (b.pillars?.[sortBy as keyof typeof b.pillars] ?? 0) -
        (a.pillars?.[sortBy as keyof typeof a.pillars] ?? 0)
      );
    });
  }, [centres, sortBy, stateFilter]);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base md:text-lg font-semibold text-foreground">
            Centre Leaderboard
          </h3>
          {stateFilter && (
            <p className="text-xs text-muted mt-0.5">
              Filtered: {stateFilter} ({ranked.length} centres)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Rank by:</span>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-card px-3 py-1.5 pr-8 text-sm text-foreground/80 focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Leaderboard List */}
      {ranked.length === 0 ? (
        <div className="p-12 text-center text-muted">
          No centres found{stateFilter ? ` in ${stateFilter}` : ""}.
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {ranked.map((centre, index) => {
            const rank = index + 1;
            const scoreColor =
              centre.score >= 80
                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : centre.score >= 60
                ? "text-amber-700 bg-amber-50 border-amber-200"
                : "text-red-700 bg-red-50 border-red-200";

            return (
              <div
                key={centre.id}
                className={cn(
                  "flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 hover:bg-surface/50 transition-colors",
                  rank <= 3 && "bg-surface/30"
                )}
              >
                {/* Rank */}
                <RankBadge rank={rank} />

                {/* Centre Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground text-sm truncate">
                      {centre.name}
                    </p>
                    <span className="text-xs text-muted font-mono">
                      {centre.code}
                    </span>
                  </div>
                  {/* State Badge */}
                  {centre.state && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface text-muted mt-0.5">
                      {centre.state}
                    </span>
                  )}
                </div>

                {/* Score */}
                <div
                  className={cn(
                    "flex items-center justify-center px-3 py-1.5 rounded-lg border text-sm font-bold min-w-[52px]",
                    scoreColor
                  )}
                >
                  {centre.score}
                </div>

                {/* Pillar Mini Bars - hidden on mobile */}
                <div className="hidden lg:flex flex-col gap-0.5">
                  {PILLAR_KEYS.map((p) => (
                    <PillarMiniBar
                      key={p.key}
                      value={centre.pillars?.[p.key as keyof typeof centre.pillars] ?? 0}
                      color={p.color}
                      label={p.label}
                    />
                  ))}
                </div>

                {/* Trend */}
                <div className="w-16 flex justify-center">
                  <TrendArrow trend={centre.trend} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
