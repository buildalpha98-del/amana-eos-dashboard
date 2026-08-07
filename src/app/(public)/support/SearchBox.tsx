"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Search } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  category: { name: string; slug: string };
}

/**
 * Debounced live search over published help articles. Results link
 * straight to the article pages.
 */
export function SearchBox() {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["help-centre-search", debounced],
    queryFn: () =>
      fetchApi<{ articles: SearchResult[] }>(
        `/api/public/help-centre/articles?search=${encodeURIComponent(debounced)}&limit=8`,
      ),
    enabled: debounced.length >= 2,
    retry: 2,
    staleTime: 60_000,
  });

  const results = data?.articles ?? [];
  const showPanel = open && debounced.length >= 2;

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-xl">
      <div className="flex items-center gap-3 rounded-full bg-card px-5 py-3.5 shadow-lg ring-1 ring-black/5">
        <Search className="h-5 w-5 shrink-0 text-brand/50" aria-hidden />
        <input
          type="search"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for answers — e.g. “casual booking”, “CCS”…"
          aria-label="Search help articles"
          className="w-full bg-transparent text-base text-brand outline-none placeholder:text-brand/40"
        />
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-brand/40" aria-hidden />}
      </div>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl bg-card text-left shadow-xl ring-1 ring-black/5">
          {results.length === 0 && !isFetching ? (
            <div className="px-5 py-4 text-sm text-brand/70">
              No articles match &ldquo;{debounced}&rdquo;.{" "}
              <Link href="/support/tickets/new" className="font-medium underline">
                Submit a ticket
              </Link>{" "}
              and we&rsquo;ll help directly.
            </div>
          ) : (
            <ul>
              {results.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/support/articles/${a.slug}`}
                    className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-parent-bg"
                    onClick={() => setOpen(false)}
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand/50" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium text-brand">{a.title}</span>
                      <span className="block text-xs text-brand/60">{a.category.name}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
