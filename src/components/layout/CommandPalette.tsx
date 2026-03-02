"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Mountain,
  CheckSquare,
  AlertCircle,
  Building2,
  FolderKanban,
  X,
} from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  type: "rock" | "todo" | "issue" | "service" | "project";
  subtitle?: string;
}

const typeConfig = {
  rock: { icon: Mountain, color: "text-purple-600", bg: "bg-purple-50", href: "/rocks" },
  todo: { icon: CheckSquare, color: "text-emerald-600", bg: "bg-emerald-50", href: "/todos" },
  issue: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", href: "/issues" },
  service: { icon: Building2, color: "text-blue-600", bg: "bg-blue-50", href: "/services" },
  project: { icon: FolderKanban, color: "text-amber-600", bg: "bg-amber-50", href: "/projects" },
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
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

  const handleSelect = (result: SearchResult) => {
    const config = typeConfig[result.type];
    router.push(config.href);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-gray-200">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search rocks, todos, issues, services, projects..."
            className="flex-1 py-4 text-sm text-gray-900 bg-transparent focus:outline-none placeholder:text-gray-400"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Searching...
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No results found for &quot;{query}&quot;
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-2">
              {results.map((result, index) => {
                const config = typeConfig[result.type];
                const Icon = config.icon;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      index === activeIndex ? "bg-gray-100" : "hover:bg-gray-50"
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
                    <span className="text-[10px] font-medium text-gray-400 uppercase">
                      {result.type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && query.length < 2 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Type at least 2 characters to search
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 text-[10px] text-gray-400">
          <span>
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">↑↓</kbd>{" "}
            Navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">↵</kbd>{" "}
            Open
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Esc</kbd>{" "}
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
