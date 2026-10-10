"use client";
import { useEffect, useState } from "react";
import {
  WEBSITE_CENTRES,
  WEBSITE_CONTEXT_KEY,
  websiteEnrolContext,
} from "@/lib/website-enrol-context";

/** Keeps the requested centre visible without assigning a child to a service. */
export function WebsiteEnrolContext() {
  const [summary, setSummary] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      const incoming = websiteEnrolContext(
        new URLSearchParams(window.location.search),
      );
      let context = incoming;
      try {
        if (incoming.size)
          sessionStorage.setItem(WEBSITE_CONTEXT_KEY, incoming.toString());
        else
          context = websiteEnrolContext(
            new URLSearchParams(
              sessionStorage.getItem(WEBSITE_CONTEXT_KEY) ?? "",
            ),
          );
      } catch {
        /* The URL still works when storage is unavailable. */
      }
      const centre = WEBSITE_CENTRES[context.get("centre") ?? ""];
      setSummary(
        [centre, context.get("program") ? "Holiday Quest" : ""]
          .filter(Boolean)
          .join(" · "),
      );
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  if (!summary) return null;
  return (
    <aside className="rounded-xl border border-border bg-surface p-4 text-foreground">
      <p className="text-sm font-semibold">Your interest: {summary}</p>
      <p className="mt-1 text-xs text-muted">
        Confirm your child’s school and care requirements in the form. Our team
        will confirm availability; this is not a booking.
      </p>
    </aside>
  );
}
