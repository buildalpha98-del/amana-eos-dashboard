"use client";

import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type HomeView = "focused" | "classic";

const CHANGE_EVENT = "amana:home-view-changed";
const fallbackPreferences = new Map<string, HomeView>();
const serverSnapshot = (): HomeView => "focused";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Separate preferences per signed-in user and surface, including shared iPads. */
export function useHomeView(surface: string, userId?: string) {
  const key = `amana.home-view.v1.${userId ?? "guest"}.${surface}`;
  const getSnapshot = useCallback((): HomeView => {
    if (fallbackPreferences.has(key)) return fallbackPreferences.get(key)!;
    try {
      return window.localStorage.getItem(key) === "classic" ? "classic" : "focused";
    } catch { return "focused"; }
  }, [key]);
  const view = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  function setView(next: HomeView) {
    try {
      window.localStorage.setItem(key, next);
      fallbackPreferences.delete(key);
    } catch { fallbackPreferences.set(key, next); }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return { view, setView };
}

export function HomeViewToggle({ view, onChange }: {
  view: HomeView;
  onChange: (view: HomeView) => void;
}) {
  return (
    <div role="group" aria-label="Home view" className="inline-flex rounded-xl border border-border bg-card p-1">
      {(["focused", "classic"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => onChange(option)}
          className={cn(
            "min-h-11 rounded-lg px-3 text-sm font-medium transition-colors",
            view === option ? "bg-accent text-brand-dark" : "text-muted hover:bg-surface hover:text-foreground",
          )}
        >
          {option === "focused" ? "Shift view" : "Classic"}
        </button>
      ))}
    </div>
  );
}
