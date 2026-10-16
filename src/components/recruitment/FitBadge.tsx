"use client";

/** The automatic fit (src/lib/recruitment/fit.ts) as a coloured chip + reasons. */
import { cn } from "@/lib/utils";
import { FIT_LABELS, type FitLabel } from "@/lib/recruitment/fit";

const STYLE: Record<FitLabel, string> = {
  strong: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  good: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  possible: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  not_eligible: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
};

export function FitBadge({ label, score, reasons }: { label: string | null; score: number | null; reasons?: string[] }) {
  if (!label || !(label in STYLE)) return null;
  const l = label as FitLabel;
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold", STYLE[l])}
      title={reasons?.length ? reasons.join("\n") : undefined}
    >
      {FIT_LABELS[l]}
      {score != null && l !== "not_eligible" ? ` · ${score}` : ""}
    </span>
  );
}
