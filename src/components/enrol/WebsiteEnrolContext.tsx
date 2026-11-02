"use client";
import { useEffect, useState } from "react";
import {
  WEBSITE_CENTRES,
  WEBSITE_CONTEXT_KEY,
  WEBSITE_PROGRAMS,
  websiteEnrolContext,
} from "@/lib/website-enrol-context";

/**
 * What the family came from the website for — shown ONLY when it's a specific
 * program (Holiday Quest, Al Hafiz). It never assigns a school or service.
 *
 * 2 Nov 2026 (Daniel): a bare "Your interest: MFIS Greenacre" confused
 * parents ("why is it forcing that school?") — they choose the school in the
 * form, any centre. Worse, the centre stuck from an earlier page visit even
 * when they pressed the general Enrol button. So:
 *   - `entry` (the sign-up page, where every website link lands) REPLACES the
 *     stored context with whatever this visit's link carries — clearing it
 *     when the link carries nothing;
 *   - the form falls back to the stored context (sign-up → form drops the
 *     query string);
 *   - a centre on its own shows nothing.
 */
export function WebsiteEnrolContext({ entry = false }: { entry?: boolean }) {
  const [summary, setSummary] = useState<{ program: string; centre: string } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const incoming = websiteEnrolContext(new URLSearchParams(window.location.search));
      let context = incoming;
      try {
        if (incoming.size) sessionStorage.setItem(WEBSITE_CONTEXT_KEY, incoming.toString());
        else if (entry) sessionStorage.removeItem(WEBSITE_CONTEXT_KEY);
        else
          context = websiteEnrolContext(
            new URLSearchParams(sessionStorage.getItem(WEBSITE_CONTEXT_KEY) ?? ""),
          );
      } catch {
        /* The URL still works when storage is unavailable. */
      }
      const program = WEBSITE_PROGRAMS[context.get("program") ?? ""];
      setSummary(program ? { program, centre: WEBSITE_CENTRES[context.get("centre") ?? ""] ?? "" } : null);
    }, 0);
    return () => clearTimeout(timer);
  }, [entry]);
  if (!summary) return null;
  return (
    <aside className="rounded-xl border border-border bg-surface p-4 text-foreground">
      <p className="text-sm font-semibold">
        Enrolling for {summary.program}
        {summary.centre ? ` at ${summary.centre}` : ""}
      </p>
      <p className="mt-1 text-xs text-muted">
        You&apos;ll choose your child&apos;s school in the form. Our team will confirm
        availability; this is not a booking.
      </p>
    </aside>
  );
}
