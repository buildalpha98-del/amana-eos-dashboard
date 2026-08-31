"use client";

/**
 * StatusChip — the app-wide attention ladder (2026-07-06 design system).
 *
 * Exactly four levels so colour reads as urgency everywhere without a
 * legend:
 *   now    — act today (red)
 *   soon   — act this week (amber)
 *   review — a decision is waiting on you (blue)
 *   queue  — informational / parked (grey)
 *
 * Use this instead of hand-rolled pills for anything that expresses
 * "how urgently does this need a human". Decorative/category badges
 * (session types, roles, centre codes) are NOT attention and should
 * not use it.
 */

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusChipLevel = "now" | "soon" | "review" | "queue";

const LEVEL_CLASSES: Record<StatusChipLevel, string> = {
  now: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  soon: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800",
  review: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  queue: "bg-surface text-muted border-border",
};

export function StatusChip({
  level,
  icon: Icon,
  children,
  className,
}: {
  level: StatusChipLevel;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        LEVEL_CLASSES[level],
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}
