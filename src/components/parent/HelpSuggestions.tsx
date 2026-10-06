"use client";

/**
 * "Is this what you need?" — Help Centre answers matching what a parent is
 * typing into a new message, shown BEFORE they send.
 *
 * Never a gate: the Send button stays exactly where it was, and a parent
 * whose question isn't answered just carries on. The answers come from the
 * same Help Centre articles staff edit at /help-centre (ranking in
 * src/lib/help-suggest.ts), so there is one list of answers, not two.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { ChevronDown, Lightbulb } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
}

export function HelpSuggestions({ text }: { text: string }) {
  const query = useDebouncedValue(text.trim(), 500);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["parent", "help-suggestions", query],
    queryFn: () =>
      fetchApi<{ suggestions: Suggestion[] }>(
        `/api/parent/help-suggestions?q=${encodeURIComponent(query)}`,
      ),
    enabled: query.length >= 3,
    staleTime: 5 * 60_000,
    retry: false,
    // A failed lookup must never interrupt someone writing to us.
    meta: { suppressGlobalErrorToast: true },
  });

  const suggestions = query.length >= 3 ? (data?.suggestions ?? []) : [];
  if (suggestions.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-accent bg-accent/10 p-3 space-y-2"
      aria-live="polite"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Lightbulb className="w-4 h-4 text-brand" />
        These might answer your question
      </p>
      {suggestions.map((s) => {
        const open = openId === s.id;
        return (
          <div key={s.id} className="rounded-lg bg-card border border-border">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : s.id)}
              aria-expanded={open}
              className="w-full flex items-start justify-between gap-2 p-2.5 text-left min-h-11"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {s.title}
                </span>
                {!open && (
                  <span className="block text-xs text-muted mt-0.5 line-clamp-2">
                    {s.excerpt}
                  </span>
                )}
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 shrink-0 text-muted mt-0.5 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
            {open && (
              <div className="px-3 pb-3 space-y-2 text-sm leading-relaxed text-foreground">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    h1: (p) => <p className="font-semibold" {...p} />,
                    h2: (p) => <p className="font-semibold" {...p} />,
                    h3: (p) => <p className="font-semibold" {...p} />,
                    a: (p) => (
                      <a
                        className="font-medium text-brand underline underline-offset-2"
                        target="_blank"
                        rel="noopener noreferrer"
                        {...p}
                      />
                    ),
                    ul: (p) => <ul className="list-disc space-y-1 pl-5" {...p} />,
                    ol: (p) => <ol className="list-decimal space-y-1 pl-5" {...p} />,
                  }}
                >
                  {s.body}
                </ReactMarkdown>
                <p className="text-xs text-muted pt-1 border-t border-border">
                  Still need help? Send your message below and our team will
                  reply.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
