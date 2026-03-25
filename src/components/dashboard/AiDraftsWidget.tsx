"use client";

import { Sparkles, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useAiDraftCount } from "@/hooks/useAiDrafts";

export function AiDraftsWidget() {
  const { data } = useAiDraftCount();
  const count = data ?? 0;

  if (count === 0) return null;

  return (
    <Link
      href="/todos"
      className="rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-center gap-3 shadow-[var(--shadow-warm-sm)] hover:border-amber-300 hover:bg-amber-50 transition-colors"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
        <Sparkles className="w-4 h-4 text-amber-600 animate-pulse-subtle" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800">
          {count} draft{count !== 1 ? "s" : ""} ready for your review
        </p>
        <p className="text-xs text-amber-600 mt-0.5">
          AI has prepared deliverables for your tasks
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
    </Link>
  );
}
