"use client";

import { useEffect, useState } from "react";

/**
 * A value that lags behind its source until typing stops.
 *
 * Used for the search boxes that now query the SERVER rather than filtering an
 * array already in memory — without this, every keystroke is a round trip.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
