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

import { useSyncExternalStore, useCallback } from "react";

export type NavLayout = "sidebar" | "topbar";

const STORAGE_KEY = "amana.navLayout";
const SAME_TAB_EVENT = "amana:navLayoutChanged";

function readPreference(): NavLayout {
  if (typeof window === "undefined") return "sidebar";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "topbar" ? "topbar" : "sidebar";
  } catch {
    return "sidebar";
  }
}

// Module-level cache so getSnapshot returns a stable value between
// change notifications, and so setLayout still applies in-tab even
// when localStorage refuses the write (private mode).
let currentLayout: NavLayout | null = null;

function getSnapshot(): NavLayout {
  if (currentLayout === null) currentLayout = readPreference();
  return currentLayout;
}

function getServerSnapshot(): NavLayout {
  return "sidebar";
}

function subscribe(onChange: () => void): () => void {
  // Cross-tab sync via the native `storage` event — only fires
  // on *other* tabs, not the current one.
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      currentLayout = readPreference();
      onChange();
    }
  };
  // Same-tab sync — multiple instances of this hook (the toggle
  // button and the dashboard layout both call it) need to react
  // immediately when one of them calls setLayout. localStorage
  // alone doesn't notify same-tab listeners, so we dispatch our
  // own custom event and every hook instance listens for it.
  const handleSameTab = () => onChange();
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SAME_TAB_EVENT, handleSameTab);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SAME_TAB_EVENT, handleSameTab);
  };
}

export function useNavLayout(): {
  layout: NavLayout;
  setLayout: (next: NavLayout) => void;
} {
  const layout = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLayout = useCallback((next: NavLayout) => {
    currentLayout = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private-mode storage refusal — non-fatal, just won't persist */
    }
    // Notify every hook instance in this tab (including this one).
    try {
      window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: next }));
    } catch {
      /* Event dispatch shouldn't fail in any normal browser */
    }
  }, []);

  return { layout, setLayout };
}
