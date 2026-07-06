"use client";

/**
 * AttentionCard — the third card tier (2026-07-06 design system).
 *
 * Card hierarchy:
 *   ambient   — flat `bg-surface`, no border (stats, context)
 *   standard  — `bg-card border border-border rounded-xl` (content)
 *   attention — THIS: brand-tinted border + wash, for the one thing on
 *               a screen that wants the reader
 *
 * Restraint rule: at most ONE AttentionCard visible per view. If two
 * things demand attention, the second one is a StatusChip in a
 * standard card, not a second glow.
 *
 * Generalises the MorningBriefCard treatment so pages stop inventing
 * their own emphasis styles.
 */

import { cn } from "@/lib/utils";

export function AttentionCard({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-xl border border-brand/30 bg-gradient-to-br from-brand/5 to-transparent p-5",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
