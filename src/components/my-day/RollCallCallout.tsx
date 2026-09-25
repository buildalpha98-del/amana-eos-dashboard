"use client";

/**
 * RollCallCallout — the /my-day roll-call entry point (Staff Portal v2
 * Phase 2, per MobileMyDay.dc.html).
 *
 * When the centre-day data can tell us how many booked children have no
 * attendance action yet, this is the loud accent card — "N children not
 * yet marked in". When counts are unavailable (dashboard fetch failed
 * or still loading) or everyone is accounted for, it degrades to the
 * quiet bordered row the page has always had, so the one-tap path to
 * Roll Call never disappears.
 */

import Link from "next/link";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { useCentreDay, countNotYetMarkedIn } from "./useCentreDay";

export function RollCallCallout({ serviceId }: { serviceId: string }) {
  const { data } = useCentreDay(serviceId);
  const href = `/services/${serviceId}?tab=daily&sub=roll-call`;

  const notMarked = data ? countNotYetMarkedIn(data) : null;

  if (notMarked !== null && notMarked > 0) {
    return (
      <Link
        href={href}
        className="flex min-h-[56px] items-center gap-3.5 rounded-2xl bg-accent p-4 text-brand-dark shadow-[var(--shadow-warm)] transition-opacity hover:opacity-90"
        data-testid="roll-call-callout"
      >
        <ClipboardCheck className="h-6 w-6 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Roll call</span>
          <span className="block text-xs opacity-75">
            {notMarked} {notMarked === 1 ? "child" : "children"} not yet
            marked in
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
      </Link>
    );
  }

  // Counts unavailable, or everyone booked is already accounted for.
  return (
    <Link
      href={href}
      className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-surface/50"
      data-testid="roll-call-row"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
          <ClipboardCheck className="h-5 w-5 text-brand" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Roll Call</p>
          <p className="text-xs text-muted">
            {notMarked === 0
              ? "Everyone booked is marked in"
              : "Sign children in and out"}
          </p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
    </Link>
  );
}
