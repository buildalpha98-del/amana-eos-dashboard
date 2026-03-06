"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  Mountain,
  CheckSquare,
  AlertCircle,
  Building2,
  FolderKanban,
  X,
  Clock,
  ArrowRight,
} from "lucide-react";
import { navItems as sharedNavItems } from "@/lib/nav-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  id: string;
  title: string;
  type: "rock" | "todo" | "issue" | "service" | "project";
  subtitle?: string;
}

interface PageOption {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
}

/** A flat item used for keyboard navigation across heterogeneous lists. */
type FlatItem =
  | { kind: "recent"; query: string }
  | { kind: "page"; page: PageOption }
  | { kind: "result"; result: SearchResult };

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const RECENT_SEARCHES_KEY = "amana-recent-searches";
const MAX_RECENT = 5;

const typeConfig: Record<
  SearchResult["type"],
  { icon: React.ElementType; color: string; bg: string; href: string; label: string }
> = {
  rock: { icon: Mountain, color: "text-purple-600", bg: "bg-purple-50", href: "/rocks", label: "Rocks" },
  todo: { icon: CheckSquare, color: "text-emerald-600", bg: "bg-emerald-50", href: "/todos", label: "To-Dos" },
  issue: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", href: "/issues", label: "Issues" },
  service: { icon: Building2, color: "text-blue-600", bg: "bg-blue-50", href: "/services", label: "Services" },
  project: { icon: FolderKanban, color: "text-amber-600", bg: "bg-amber-50", href: "/projects", label: "Projects" },
};

// Derive page options from shared nav config — single source of truth
const pageOptions: PageOption[] = sharedNavItems.map(({ href, label, icon, section }) => ({
  label,
  href,
  icon,
  section,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(0, MAX_RECENT);
  } catch {
    // ignore
  }
  return [];
}

function saveRecentSearch(q: string) {
  try {
    const existing = loadRecentSearches();
    const trimmed = q.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...existing.filter((s) => s !== trimmed)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

function groupResultsByType(results: SearchResult[]) {
  const groups: { type: SearchResult["type"]; items: SearchResult[] }[] = [];
  const map = new Map<SearchResult["type"], SearchResult[]>();

  for (const r of results) {
    if (!map.has(r.type)) {
      const items: SearchResult[] = [];
      map.set(r.type, items);
      groups.push({ type: r.type, items });
    }
    map.get(r.type)!.push(r);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // ---- Filter pages by query for quick-nav ----
  const filteredPages = useMemo(() => {
    if (query.trim().length === 0) return pageOptions;
    const lower = query.toLowerCase();
    return pageOptions.filter(
      (p) =>
        p.label.toLowerCase().includes(lower) ||
        p.section.toLowerCase().includes(lower)
    );
  }, [query]);

  // Pages grouped by section
  const groupedPages = useMemo(() => {
    const groups: { section: string; pages: PageOption[] }[] = [];
    const map = new Map<string, PageOption[]>();
    for (const p of filteredPages) {
      if (!map.has(p.section)) {
        const items: PageOption[] = [];
        map.set(p.section, items);
        groups.push({ section: p.section, pages: items });
      }
      map.get(p.section)!.push(p);
    }
    return groups;
  }, [filteredPages]);

  // Grouped search results
  const groupedResults = useMemo(() => groupResultsByType(results), [results]);

  // ---- Build flat list for keyboard navigation ----
  const flatItems: FlatItem[] = useMemo(() => {
    const hasSearchQuery = query.trim().length >= 2;

    // When we have search results, show results grouped by type
    if (hasSearchQuery && results.length > 0) {
      const items: FlatItem[] = [];
      for (const group of groupedResults) {
        for (const result of group.items) {
          items.push({ kind: "result", result });
        }
      }
      return items;
    }

    // When no query (or query < 2 chars), show recents + pages
    if (!hasSearchQuery) {
      const items: FlatItem[] = [];
      // Recent searches
      for (const q of recentSearches) {
        items.push({ kind: "recent", query: q });
      }
      // Pages
      for (const page of filteredPages) {
        items.push({ kind: "page", page });
      }
      return items;
    }

    return [];
  }, [query, results, groupedResults, recentSearches, filteredPages]);

  // ---- Effects ----

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      setRecentSearches(loadRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setActiveIndex(0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // ---- Handlers ----

  const handleSelectResult = (result: SearchResult) => {
    if (query.trim().length >= 2) saveRecentSearch(query.trim());
    const config = typeConfig[result.type];
    router.push(config.href);
    onClose();
  };

  const handleSelectPage = (page: PageOption) => {
    router.push(page.href);
    onClose();
  };

  const handleSelectRecent = (q: string) => {
    setQuery(q);
    doSearch(q);
  };

  const handleRemoveRecent = (q: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentSearches.filter((s) => s !== q);
    setRecentSearches(updated);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleFlatSelect = (item: FlatItem) => {
    switch (item.kind) {
      case "result":
        handleSelectResult(item.result);
        break;
      case "page":
        handleSelectPage(item.page);
        break;
      case "recent":
        handleSelectRecent(item.query);
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[activeIndex]) {
      e.preventDefault();
      handleFlatSelect(flatItems[activeIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  // ---- Derive render state ----
  const hasSearchQuery = query.trim().length >= 2;
  const showResults = hasSearchQuery && !loading && results.length > 0;
  const showNoResults = hasSearchQuery && !loading && results.length === 0;
  const showIdleState = !hasSearchQuery && !loading;

  // Track flat index across sections for keyboard highlighting
  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-200">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or jump to..."
            className="flex-1 py-4 text-sm text-gray-900 bg-transparent focus:outline-none placeholder:text-gray-400"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-300 hover:text-gray-500 text-xs"
          >
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-medium text-gray-400">
              Esc
            </kbd>
          </button>
        </div>

        {/* Results / idle area */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto">
          {/* Loading spinner */}
          {loading && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Searching...
            </div>
          )}

          {/* No results */}
          {showNoResults && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-400">
                No results found for &quot;{query}&quot;
              </p>
              <p className="text-xs text-gray-300 mt-1">
                Try a different keyword or browse pages below
              </p>
            </div>
          )}

          {/* Grouped search results */}
          {showResults && (() => {
            flatIdx = 0;
            return (
              <div className="py-1">
                {groupedResults.map((group) => {
                  const config = typeConfig[group.type];
                  return (
                    <div key={group.type}>
                      <div className="px-4 pt-3 pb-1.5">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                          {config.label}
                        </span>
                      </div>
                      {group.items.map((result) => {
                        const idx = flatIdx++;
                        const Icon = config.icon;
                        return (
                          <button
                            key={`${result.type}-${result.id}`}
                            data-index={idx}
                            onClick={() => handleSelectResult(result)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              idx === activeIndex ? "bg-gray-100" : "hover:bg-gray-50"
                            }`}
                          >
                            <div
                              className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${config.bg}`}
                            >
                              <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {result.title}
                              </p>
                              {result.subtitle && (
                                <p className="text-xs text-gray-400 truncate">
                                  {result.subtitle}
                                </p>
                              )}
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Idle state: recent searches + quick-nav pages */}
          {showIdleState && (() => {
            flatIdx = 0;
            return (
              <div className="py-1">
                {/* Recent searches */}
                {recentSearches.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1.5">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Recent Searches
                      </span>
                    </div>
                    {recentSearches.map((q) => {
                      const idx = flatIdx++;
                      return (
                        <button
                          key={`recent-${q}`}
                          data-index={idx}
                          onClick={() => handleSelectRecent(q)}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors group ${
                            idx === activeIndex ? "bg-gray-100" : "hover:bg-gray-50"
                          }`}
                        >
                          <Clock className="w-4 h-4 text-gray-300 shrink-0" />
                          <span className="flex-1 text-sm text-gray-600 truncate">
                            {q}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleRemoveRecent(q, e)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRemoveRecent(q, e as unknown as React.MouseEvent); } }}
                            className="p-0.5 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-500 transition-opacity"
                            title="Remove"
                          >
                            <X className="w-3 h-3" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Quick-nav pages grouped by section */}
                {groupedPages.map((group) => (
                  <div key={group.section}>
                    <div className="px-4 pt-3 pb-1.5">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {group.section}
                      </span>
                    </div>
                    {group.pages.map((page) => {
                      const idx = flatIdx++;
                      const Icon = page.icon;
                      const isCurrentPage = pathname === page.href;
                      return (
                        <button
                          key={page.href}
                          data-index={idx}
                          onClick={() => handleSelectPage(page)}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                            idx === activeIndex ? "bg-gray-100" : "hover:bg-gray-50"
                          }`}
                        >
                          <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="flex-1 text-sm text-gray-700 truncate">
                            {page.label}
                          </span>
                          {isCurrentPage && (
                            <span className="text-[10px] font-medium text-emerald-500">
                              Current
                            </span>
                          )}
                          <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                ))}

                {/* Hint */}
                {recentSearches.length === 0 && filteredPages.length === pageOptions.length && (
                  <div className="px-4 pt-4 pb-3 text-center">
                    <p className="text-xs text-gray-400">
                      Search across rocks, to-dos, issues, services and projects
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer with keyboard hints */}
        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 text-[10px] text-gray-400">
          <span>
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">
              {"\u2191\u2193"}
            </kbd>{" "}
            Navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">
              {"\u21B5"}
            </kbd>{" "}
            Open
          </span>
          <span className="ml-auto text-gray-300">
            {flatItems.length} item{flatItems.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
