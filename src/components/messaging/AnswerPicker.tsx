"use client";

/**
 * Staff side of the parent-question library: pick a Help Centre answer and
 * drop it into the reply box to edit and send.
 *
 * Opens pre-searched with the parent's latest message, because the person
 * replying already knows the question — they shouldn't have to retype it.
 * Unpublished articles are included and flagged "Staff only": that's where
 * internal policy answers live. Answers are edited at /help-centre.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Loader2, X } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { markdownToPlain } from "@/lib/help-suggest";

interface Answer {
  id: string;
  title: string;
  body: string;
  excerpt: string;
  category: string | null;
  parentVisible: boolean;
}

export function AnswerPicker({
  parentMessage,
  onInsert,
}: {
  parentMessage: string;
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["help-centre", "suggest", query],
    queryFn: () =>
      fetchApi<{ answers: Answer[] }>(
        `/api/help-centre/suggest?q=${encodeURIComponent(query)}`,
      ),
    enabled: open,
    staleTime: 60_000,
    retry: 2,
  });

  const openPicker = () => {
    setSearch(parentMessage.slice(0, 300));
    setOpen(true);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand/5 rounded-lg transition-colors min-h-[32px]"
      >
        <BookOpenCheck className="w-3.5 h-3.5" />
        Answers
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Common answers"
          className="absolute bottom-full right-0 mb-2 w-[min(26rem,calc(100vw-2rem))] max-h-96 flex flex-col rounded-xl border border-border bg-card shadow-xl z-20"
        >
          <div className="flex items-center gap-2 p-2 border-b border-border">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search common questions…"
              className="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close answers"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:bg-surface"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-1.5 space-y-1">
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted" />
              </div>
            ) : (data?.answers ?? []).length === 0 ? (
              <p className="text-xs text-muted p-3">
                No matching answer yet. Add one in{" "}
                <Link href="/help-centre" className="underline text-brand">
                  Help Centre
                </Link>{" "}
                so the next reply is one click.
              </p>
            ) : (
              data!.answers.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onInsert(markdownToPlain(a.body));
                    setOpen(false);
                  }}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-surface"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {a.title}
                    </span>
                    {!a.parentVisible && (
                      <span className="shrink-0 text-2xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        Staff only
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted mt-0.5 line-clamp-2">
                    {a.category ? `${a.category} · ` : ""}
                    {a.excerpt}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="px-3 py-2 border-t border-border text-2xs text-muted">
            Inserts into your reply so you can personalise it before sending.
          </div>
        </div>
      )}
    </div>
  );
}
