"use client";

/**
 * useDensity — comfortable/compact display density (2026-07-06 design
 * system). Persisted per user in localStorage and applied as a
 * `data-density` attribute on <html>; globals.css compacts table row
 * padding under [data-density="compact"], so every table in the app
 * responds without per-table wiring.
 *
 * Comfortable (default) keeps the 44px touch-friendly rows educators
 * need on phones; compact is for admins living in tables all day.
 */

import { useCallback, useEffect, useState } from "react";

export type Density = "comfortable" | "compact";
const STORAGE_KEY = "amana.density";

function readStored(): Density {
  if (typeof window === "undefined") return "comfortable";
  return window.localStorage.getItem(STORAGE_KEY) === "compact"
    ? "compact"
    : "comfortable";
}

function apply(density: Density) {
  if (typeof document === "undefined") return;
  if (density === "compact") {
    document.documentElement.dataset.density = "compact";
  } else {
    delete document.documentElement.dataset.density;
  }
}

export function useDensity() {
  const [density, setDensity] = useState<Density>(readStored);

  useEffect(() => {
    apply(density);
  }, [density]);

  const toggle = useCallback(() => {
    setDensity((d) => {
      const next: Density = d === "compact" ? "comfortable" : "compact";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // private browsing — session-only is fine
      }
      return next;
    });
  }, []);

  return { density, toggle };
}
