"use client";

/**
 * Small amber "Unsaved changes" indicator.
 * Render in a header area when a form has unsaved changes.
 */
export function UnsavedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      Unsaved changes
    </span>
  );
}
