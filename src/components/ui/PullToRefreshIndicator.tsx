"use client";

import { Loader2, ArrowDown } from "lucide-react";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

/**
 * Visual indicator for pull-to-refresh. Render at the top of your page content.
 * Shows a downward arrow while pulling and a spinner while refreshing.
 */
export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const ready = progress >= 1;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-200 md:hidden"
      style={{ height: pullDistance }}
    >
      {isRefreshing ? (
        <Loader2 className="w-5 h-5 text-brand animate-spin" />
      ) : (
        <ArrowDown
          className="w-5 h-5 text-muted transition-transform duration-200"
          style={{
            transform: `rotate(${ready ? 180 : 0}deg)`,
            opacity: progress,
          }}
        />
      )}
    </div>
  );
}
