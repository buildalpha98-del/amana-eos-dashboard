"use client";

import { cn } from "@/lib/utils";
import { computeRatio, type RatioStatus } from "@/lib/roster-ratio";

export interface RatioBadgeProps {
  staffCount: number;
  childrenCount: number;
  className?: string;
}

/**
 * Staff:children ratio badge.
 *
 * Thresholds (per Amana OSHC shift-gap policy) are defined in
 * `src/lib/roster-ratio.ts` and shared with the shift-gap-detector cron.
 *  - ratio > 13      → breach (red)
 *  - ratio > 13*0.85 → warning (amber, "near limit")
 *  - else            → ok (green)
 */

const STATUS_STYLES: Record<RatioStatus, string> = {
  none: "bg-surface text-foreground/80 border-border",
  ok: "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-200 border-green-400",
  warning: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-400",
  breach: "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-200 border-red-400",
};

export function RatioBadge({ staffCount, childrenCount, className }: RatioBadgeProps) {
  const result = computeRatio(staffCount, childrenCount);
  return (
    <span
      data-status={result.status}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[result.status],
        className,
      )}
    >
      {result.message}
    </span>
  );
}
