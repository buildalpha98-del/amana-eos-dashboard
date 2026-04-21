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
  none: "bg-gray-100 text-gray-700 border-gray-300",
  ok: "bg-green-100 text-green-800 border-green-400",
  warning: "bg-amber-100 text-amber-800 border-amber-400",
  breach: "bg-red-100 text-red-800 border-red-400",
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
