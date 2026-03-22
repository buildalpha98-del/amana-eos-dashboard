"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  disabled?: boolean;
}

/**
 * Pull-to-refresh for mobile. Shows a spinner when the user pulls down
 * from the top of the page. Only activates when scrollY === 0.
 *
 * Returns { isRefreshing, pullDistance, handlers } — attach handlers
 * to the container or use the PullToRefreshIndicator component.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || isRefreshing) return;
      if (window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    },
    [disabled, isRefreshing]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling.current || disabled || isRefreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        // Dampen the pull (feels more natural)
        const dampened = Math.min(delta * 0.4, 120);
        setPullDistance(dampened);
      }
    },
    [disabled, isRefreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold * 0.5); // Hold at indicator position
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    if (disabled) return;
    // Only on mobile (coarse pointer)
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (!isTouchDevice) return;

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [disabled, onTouchStart, onTouchMove, onTouchEnd]);

  return { isRefreshing, pullDistance };
}
