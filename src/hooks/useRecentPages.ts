"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecentPage {
  path: string;
  title: string;
  icon?: string; // lucide icon name for serialisation — resolved at render time
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "amana-recent-pages";
const MAX_PAGES = 10;

/** Paths that should not be tracked (auth, API, etc.) */
const EXCLUDED_PATHS = new Set(["/login", "/register", "/forgot-password", "/api"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadPages(): RecentPage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(0, MAX_PAGES);
  } catch {
    // ignore corrupt data
  }
  return [];
}

function savePages(pages: RecentPage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages.slice(0, MAX_PAGES)));
  } catch {
    // ignore quota errors
  }
}

/**
 * Returns a human-readable relative time string.
 * e.g. "just now", "2m ago", "1h ago", "3d ago"
 */
export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRecentPages() {
  const pathname = usePathname();
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const initialised = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    setRecentPages(loadPages());
    initialised.current = true;
  }, []);

  /**
   * Track a page visit. De-duplicates by path and keeps the list at MAX_PAGES.
   */
  const trackPage = useCallback((path: string, title: string, icon?: string) => {
    if (!path || EXCLUDED_PATHS.has(path)) return;

    setRecentPages((prev) => {
      const entry: RecentPage = { path, title, icon, timestamp: Date.now() };
      const updated = [entry, ...prev.filter((p) => p.path !== path)].slice(0, MAX_PAGES);
      savePages(updated);
      return updated;
    });
  }, []);

  return { recentPages, trackPage, pathname } as const;
}
