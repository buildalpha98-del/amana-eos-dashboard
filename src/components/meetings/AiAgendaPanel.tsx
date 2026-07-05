"use client";

/**
 * AiAgendaPanel — renders the relevant slice of the AI agenda draft
 * inside each L10 section (2026-07-05, draft-first meetings).
 *
 * Advisory only: the facilitator runs the meeting; this is the prepared
 * starting point. Follows the purple AI-surface convention used by the
 * AI Prioritisation panel on /issues.
 */

import { Sparkles, RefreshCw } from "lucide-react";
import type { MeetingAgendaDraft } from "@/hooks/useMeetings";
import { cn } from "@/lib/utils";

export function AiAgendaPanel({
  part,
  draft,
  onGenerate,
  generating,
}: {
  part: "summary" | "scorecard" | "rocks" | "ids";
  draft: MeetingAgendaDraft | null | undefined;
  /** Present only on the summary panel — the generate/regenerate CTA. */
  onGenerate?: () => void;
  generating?: boolean;
}) {
  // Sections other than the summary stay silent when there's no draft
  // (or nothing relevant in it) — no empty purple boxes mid-meeting.
  if (!draft && part !== "summary") return null;
  if (draft) {
    if (part === "scorecard" && !draft.scorecardCommentary) return null;
    if (part === "rocks" && draft.rockSuggestions.length === 0) return null;
    if (part === "ids" && draft.idsOrder.length === 0) return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-purple-800">
          <Sparkles className="h-4 w-4" />
          {part === "summary" && "AI agenda draft"}
          {part === "scorecard" && "AI scorecard commentary"}
          {part === "rocks" && "AI rock suggestions"}
          {part === "ids" && "AI-proposed IDS order"}
        </h4>
        {part === "summary" && onGenerate && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-purple-300 px-2.5 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100",
              generating && "opacity-60",
            )}
          >
            <RefreshCw className={cn("h-3 w-3", generating && "animate-spin")} />
            {generating
              ? "Drafting..."
              : draft
                ? "Regenerate"
                : "Draft agenda with AI"}
          </button>
        )}
      </div>

      {!draft && part === "summary" && (
        <p className="text-sm text-purple-900/80">
          No agenda draft yet — generate one to walk in with a proposed
          IDS order, scorecard commentary, and rock talking points.
        </p>
      )}

      {draft && part === "summary" && (
        <p className="text-sm text-purple-900 whitespace-pre-wrap">{draft.summary}</p>
      )}

      {draft && part === "scorecard" && (
        <p className="text-sm text-purple-900 whitespace-pre-wrap">
          {draft.scorecardCommentary}
        </p>
      )}

      {draft && part === "rocks" && (
        <ul className="space-y-1.5">
          {draft.rockSuggestions.map((r) => (
            <li key={r.rockId} className="text-sm text-purple-900">
              <span className="font-medium">{r.title}:</span> {r.suggestion}
            </li>
          ))}
        </ul>
      )}

      {draft && part === "ids" && (
        <ol className="list-decimal space-y-1.5 pl-5">
          {draft.idsOrder.map((i) => (
            <li key={i.issueId} className="text-sm text-purple-900">
              <span className="font-medium">{i.title}</span>
              <span className="text-purple-900/70"> — {i.reason}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
