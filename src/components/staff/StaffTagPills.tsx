"use client";

import { cn } from "@/lib/utils";

interface StaffTagPillsProps {
  tags: readonly string[];
  /** Show at most this many pills; the rest are summarised as "+N". */
  max?: number;
  className?: string;
}

/**
 * Read-only pill cluster. Renders the first `max` tags as small
 * rounded chips and collapses the rest into a "+N" pill that hovers
 * with the remaining tag names so admins can scan at a glance
 * without growing the row height.
 */
export function StaffTagPills({
  tags,
  max = 3,
  className,
}: StaffTagPillsProps) {
  if (!tags || tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const overflow = tags.length - shown.length;

  return (
    <div
      className={cn("inline-flex flex-wrap items-center gap-1", className)}
      data-testid="staff-tag-pills"
    >
      {shown.map((t) => (
        <span
          key={t}
          className="inline-flex items-center rounded-full bg-surface text-foreground/80 text-2xs px-2 py-0 border border-border"
          data-testid={`staff-tag-pill-${t}`}
        >
          {t}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="inline-flex items-center rounded-full bg-surface text-muted text-2xs px-2 py-0 border border-border"
          title={tags.slice(max).join(", ")}
          data-testid="staff-tag-pill-overflow"
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
