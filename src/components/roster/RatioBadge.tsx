"use client";

import { cn } from "@/lib/utils";

export interface RatioBadgeProps {
  staffCount: number;
  childrenCount: number;
  className?: string;
}

/**
 * Staff:children ratio badge.
 *
 * NOTE: Logic is inline here; Chunk 10 extracts it into
 * `src/lib/roster-ratio.ts` so the server-side shift-gap-detector cron
 * and this UI share a single source of truth.
 *
 * Thresholds (per Amana OSHC shift-gap policy):
 *  - ratio > 13      → breach (red)
 *  - ratio > 13*0.85 → warning (amber, "near limit")
 *  - else            → ok (green)
 */

type Status = "none" | "breach" | "warning" | "ok";

interface RatioState {
  status: Status;
  label: string;
  className: string;
}

function computeRatio(staffCount: number, childrenCount: number): RatioState {
  if (childrenCount <= 0) {
    return {
      status: "none",
      label: "No coverage needed",
      className: "bg-gray-100 text-gray-700 border-gray-300",
    };
  }
  if (staffCount <= 0) {
    return {
      status: "breach",
      label: "No staff rostered",
      className: "bg-red-100 text-red-800 border-red-400",
    };
  }
  const ratio = childrenCount / staffCount;
  const rounded = Math.round(ratio * 10) / 10;
  if (ratio > 13) {
    return {
      status: "breach",
      label: `${rounded}:1 exceeds 1:13`,
      className: "bg-red-100 text-red-800 border-red-400",
    };
  }
  if (ratio > 13 * 0.85) {
    return {
      status: "warning",
      label: `${rounded}:1 near limit`,
      className: "bg-amber-100 text-amber-800 border-amber-400",
    };
  }
  return {
    status: "ok",
    label: `${rounded}:1 within limit`,
    className: "bg-green-100 text-green-800 border-green-400",
  };
}

export function RatioBadge({ staffCount, childrenCount, className }: RatioBadgeProps) {
  const state = computeRatio(staffCount, childrenCount);
  return (
    <span
      data-status={state.status}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        state.className,
        className,
      )}
    >
      {state.label}
    </span>
  );
}
