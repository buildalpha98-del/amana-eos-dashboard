"use client";

/**
 * Tells families that this portal is still being built, and that day-to-day
 * business continues in OWNA for now.
 *
 * Worth being explicit about WHY this exists: a parent who has just spent
 * ten minutes on an enrolment form reasonably expects to start using the
 * thing they enrolled through. Without this they'd sit waiting for
 * bookings that aren't coming yet, or assume OWNA credentials were an
 * error. Saying so plainly costs us nothing and saves the office a round
 * of phone calls.
 *
 * Remove this component when the portal goes fully live — it's a
 * deliberately temporary piece of UI.
 */

import { Info } from "lucide-react";

export function OwnaTransitionNotice() {
  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-4">
      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            A quick note about this portal
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
            This is our new Family Portal, and we&apos;re still building it.
            Insha&apos;Allah we&apos;ll let you know as soon as it&apos;s
            fully up and running.
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
            In the meantime, you&apos;ll receive a separate email within{" "}
            <strong>24 hours</strong> with your login details for{" "}
            <strong>OWNA</strong> — the parent app we currently use for
            bookings and daily updates.
          </p>
        </div>
      </div>
    </div>
  );
}
