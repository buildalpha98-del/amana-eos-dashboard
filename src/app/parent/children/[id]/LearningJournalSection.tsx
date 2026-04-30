"use client";

/**
 * LearningJournalSection — parent-side preview of observations for a child.
 *
 * Injected inline into the ChildDetailV2 scroll below the 14-day strip.
 * Shows up to 5 most-recent observations with `visibleToParent=true`.
 * Full history view is queued for the follow-on `/parent/children/[id]/journal`
 * page (not shipped in commit 12).
 */

import { useParentChildObservations } from "@/hooks/useObservations";
import { SectionLabel } from "@/components/parent/ui";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function LearningJournalSection({ childId }: { childId: string }) {
  const { data, isLoading } = useParentChildObservations(childId);
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <section aria-label="Learning journal">
        <SectionLabel label="Learning journal" />
        <div className="warm-card text-sm text-[color:var(--color-muted)]">
          Loading…
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    // Keep the section silent when there's nothing to show — don't push empty
    // ceremony into the parent's scroll. The page will re-show it once an
    // educator shares their first observation.
    return null;
  }

  const preview = items.slice(0, 5);

  return (
    <section aria-label="Learning journal" className="space-y-2">
      <SectionLabel label="Learning journal" />
      <ul className="space-y-2">
        {preview.map((obs) => {
          const date = new Date(obs.createdAt);
          return (
            <li key={obs.id} className="warm-card">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full shrink-0 flex items-center justify-center",
                    "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]",
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[color:var(--color-foreground)]">
                    {obs.title}
                  </p>
                  <p className="text-[11px] text-[color:var(--color-muted)]">
                    {obs.author.name} ·{" "}
                    {date.toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <p className="text-[13px] text-[color:var(--color-foreground)]/80 mt-1 line-clamp-3">
                    {obs.narrative}
                  </p>
                  {(obs.mtopOutcomes.length > 0 ||
                    obs.interests.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {obs.mtopOutcomes.map((m) => (
                        <span
                          key={m}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]"
                        >
                          {m}
                        </span>
                      ))}
                      {obs.interests.slice(0, 3).map((i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[color:var(--color-cream-deep)] text-[color:var(--color-muted)]"
                        >
                          {i}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
