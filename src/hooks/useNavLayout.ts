"use client";

/**
 * Per-user nav layout preference: classic left sidebar vs OWNA-style
 * top bar with category dropdowns. Persisted to localStorage so the
 * choice sticks across sessions without needing a server round-trip.
 *
 * Default is "sidebar" — the layout the dashboard has shipped with —
 * so existing users keep their familiar nav until they actively pick
 * the new one from Settings.
 */

import { useEffect, useState, useCallback } from "react";

export type NavLayout = "sidebar" | "topbar";

const STORAGE_KEY = "amana.navLayout";

function readPreference(): NavLayout {
  if (typeof window === "undefined") return "sidebar";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "topbar" ? "topbar" : "sidebar";
  } catch {
    return "sidebar";
  }
}

export function useNavLayout(): {
  layout: NavLayout;
  setLayout: (next: NavLayout) => void;
} {
  const [layout, setLayoutState] = useState<NavLayout>("sidebar");

  useEffect(() => {
    setLayoutState(readPreference());

    // Sync across tabs — if the user toggles in another tab, this one
    // picks the change up on next render.
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLayoutState(readPreference());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setLayout = useCallback((next: NavLayout) => {
    setLayoutState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private-mode storage refusal — non-fatal, just won't persist */
    }
  }, []);

  return { layout, setLayout };
}
