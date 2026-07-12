"use client";

/**
 * MorningBriefCard — the push surface of the AI morning briefing.
 *
 * Quiet by design: hidden until the cron has produced today's brief,
 * collapses to a one-line ribbon once read, and an "all clear" morning
 * renders as a slim confirmation rather than an empty card.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sunrise, Check, Sparkles } from "lucide-react";
import { useMorningBrief, useMarkBriefRead } from "@/hooks/useMorningBrief";
import { Button } from "@/components/ui/Button";
import { AttentionCard } from "@/components/ui/AttentionCard";

export function MorningBriefCard() {
  const { data, isLoading } = useMorningBrief();
  const markRead = useMarkBriefRead();

  if (isLoading || !data?.briefing) return null;
  const brief = data.briefing;

  if (brief.readAt) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-muted">
        <Check className="h-3.5 w-3.5 text-emerald-500" />
        Morning brief read — have a good day.
      </div>
    );
  }

  return (
    <AttentionCard data-testid="morning-brief-card">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sunrise className="h-5 w-5 text-brand" />
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Your morning brief
            </h3>
            <p className="text-xs text-muted">
              {new Date(brief.date).toLocaleDateString("en-AU", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              {brief.source === "ai" && (
                <span className="ml-2 inline-flex items-center gap-0.5">
                  <Sparkles className="h-3 w-3" /> AI-composed
                </span>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => markRead.mutate()}
          loading={markRead.isPending}
        >
          Mark as read
        </Button>
      </header>

      <div className="prose prose-sm max-w-none text-sm text-foreground [&_ul]:my-1 [&_li]:my-0.5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{brief.content}</ReactMarkdown>
      </div>
    </AttentionCard>
  );
}
