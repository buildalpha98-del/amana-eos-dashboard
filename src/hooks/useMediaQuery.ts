"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query. Safe to call during SSR (returns false on
 * the server, then updates after hydration). Use for layout shifts that don't
 * need to be perfect on the first paint.
 *
 * @example
 * const isMobile = useMediaQuery("(max-width: 639px)");
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
      ) {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => {
      if (typeof window.matchMedia !== "function") return false;
      return window.matchMedia(query).matches;
    },
    () => false,
  );
}

/** Tailwind's `sm` breakpoint is 640px — anything below is "mobile" here. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 639px)");
}
