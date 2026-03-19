"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

// ─── localStorage keys ──────────────────────────────────────
const STORAGE_KEY_COLLAPSED = "amana-sidebar-collapsed";
const STORAGE_KEY_SECTIONS = "amana-sidebar-sections";
const STORAGE_KEY_FAVOURITES = "amana-sidebar-favourites";

// ─── Helpers (try-catch + JSON pattern from CommandPalette) ──
function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_COLLAPSED) === "true";
  } catch {
    return false;
  }
}

function loadCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SECTIONS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed);
  } catch {
    // ignore
  }
  return new Set();
}

function saveCollapsed(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY_COLLAPSED, String(value));
  } catch {
    // ignore
  }
}

function saveCollapsedSections(sections: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY_SECTIONS, JSON.stringify([...sections]));
  } catch {
    // ignore
  }
}

function loadFavourites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FAVOURITES);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed);
  } catch {
    // ignore
  }
  return new Set();
}

function saveFavourites(favourites: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY_FAVOURITES, JSON.stringify([...favourites]));
  } catch {
    // ignore
  }
}

// ─── Context ────────────────────────────────────────────────
interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  collapsedSections: Set<string>;
  toggleSection: (section: string) => void;
  favourites: Set<string>;
  toggleFavourite: (href: string) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedRaw] = useState<boolean>(loadCollapsed);
  const [collapsedSections, setCollapsedSections] =
    useState<Set<string>>(loadCollapsedSections);
  const [favourites, setFavourites] = useState<Set<string>>(loadFavourites);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedRaw(value);
    saveCollapsed(value);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedRaw((prev) => {
      const next = !prev;
      saveCollapsed(next);
      return next;
    });
  }, []);

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      saveCollapsedSections(next);
      return next;
    });
  }, []);

  const toggleFavourite = useCallback((href: string) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      saveFavourites(next);
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        setCollapsed,
        toggleCollapsed,
        collapsedSections,
        toggleSection,
        favourites,
        toggleFavourite,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
