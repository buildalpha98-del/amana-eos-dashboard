"use client";

import { useMemo } from "react";
import { Target } from "lucide-react";
import type { RockData } from "@/hooks/useRocks";
import type { ScorecardData } from "@/hooks/useScorecard";
import { cn } from "@/lib/utils";
import { ScorecardSection } from "./ScorecardSection";
import { RockReviewSection } from "./RockReviewSection";

/** EOS's standard "80% of Rocks done" bar — same figure the run sheet quotes. */
const ROCK_COMPLETION_TARGET = 80;

/**
 * Quarterly Pulse — step 2, "Review the Quarter" (45 min). Combines the
 * 13-week scorecard trend (ScorecardSection already renders that average
 * column, so it's reused as-is) with the quarter's Rocks split company vs
 * individual, each still edited via RockReviewSection so status changes /
 * IDS drops behave exactly as they do in the L10 Rock Review.
 */
export function QuarterReviewSection({
  scorecard,
  rocks,
  onDropToIDS,
  onEntrySubmit,
  onSendToIDS,
  sendingRockIdToIDS,
  isCompleted,
}: {
  scorecard: ScorecardData | undefined;
  rocks: RockData[] | undefined;
  onDropToIDS?: (title: string) => void;
  onEntrySubmit?: (measurableId: string, value: number, weekOf: string) => void;
  onSendToIDS?: (rock: RockData) => void;
  sendingRockIdToIDS?: string | null;
  isCompleted?: boolean;
}) {
  const companyRocks = useMemo(
    () => (rocks ?? []).filter((r) => r.rockType === "company"),
    [rocks],
  );
  const individualRocks = useMemo(
    () => (rocks ?? []).filter((r) => r.rockType === "personal"),
    [rocks],
  );

  const total = rocks?.length ?? 0;
  const done = (rocks ?? []).filter((r) => r.status === "complete").length;
  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const meetsTarget = completionPct >= ROCK_COMPLETION_TARGET;

  return (
    <div className="space-y-8">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">
          13-Week Scorecard Trend
        </h4>
        <ScorecardSection
          scorecard={scorecard}
          onDropToIDS={onDropToIDS}
          onEntrySubmit={onEntrySubmit}
          isCompleted={isCompleted}
        />
      </div>

      <div>
        <div
          className={cn(
            "rounded-lg border p-4 mb-4 flex items-center gap-3",
            meetsTarget
              ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40"
              : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40",
          )}
        >
          <Target
            className={cn(
              "w-5 h-5 flex-shrink-0",
              meetsTarget
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400",
            )}
          />
          <div className="flex-1">
            <p
              className={cn(
                "text-sm font-semibold",
                meetsTarget
                  ? "text-emerald-800 dark:text-emerald-200"
                  : "text-red-800 dark:text-red-200",
              )}
            >
              {done}/{total} Rocks completed this quarter ({completionPct}%)
            </p>
            <p
              className={cn(
                "text-xs",
                meetsTarget
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              EOS target is {ROCK_COMPLETION_TARGET}% —{" "}
              {meetsTarget ? "on target." : "below target; discuss why in IDS."}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">
              Company Rocks
            </h4>
            <RockReviewSection
              rocks={companyRocks}
              onSendToIDS={onSendToIDS}
              sendingRockIdToIDS={sendingRockIdToIDS}
            />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">
              Individual Rocks
            </h4>
            <RockReviewSection
              rocks={individualRocks}
              onSendToIDS={onSendToIDS}
              sendingRockIdToIDS={sendingRockIdToIDS}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
