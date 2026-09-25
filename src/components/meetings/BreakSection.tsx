"use client";

import { Coffee } from "lucide-react";

/**
 * Quarterly Pulse — Break. Deliberately minimal: the section timer
 * (rendered by ActiveMeetingView's header) already counts the 10 minutes
 * down; this is just the interstitial so the room knows what's happening.
 */
export function BreakSection() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
      <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
        <Coffee className="w-6 h-6 text-amber-600 dark:text-amber-400" />
      </div>
      <h4 className="text-sm font-semibold text-foreground">
        Take a 10 minute break
      </h4>
      <p className="text-xs text-muted max-w-sm">
        Stretch, grab a coffee, check messages. Come back ready for Rocks —
        the biggest block of the day.
      </p>
    </div>
  );
}
