"use client";

/**
 * SectionDivider — a labelled horizontal rule for grouping zones on
 * dense pages (2026-07-06 UX polish). Purely presentational.
 */

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2" role="separator" aria-label={label}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
