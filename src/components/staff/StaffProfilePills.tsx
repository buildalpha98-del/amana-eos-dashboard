"use client";

/**
 * StaffProfilePills — sticky horizontal section nav for the new
 * long-scroll staff profile (PR 3 of the Teams tab redesign).
 * Click → smooth-scroll to the section anchor + URL hash. Active
 * pill highlights via IntersectionObserver scroll-spy, with a 500ms
 * suppression window after a programmatic click so the active state
 * doesn't toggle mid-flight.
 *
 * 2026-05-04: introduced (spec PR #77).
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type StaffProfileSectionKey =
  | "employment"
  | "pay"
  | "documents"
  | "performance"
  | "health";

interface SectionPill {
  id: StaffProfileSectionKey;
  label: string;
  /** Active-state Tailwind colour classes. Each section has its own
   *  dot/pill colour to mirror the EH design. */
  activeClass: string;
  dotClass: string;
}

const SECTIONS: SectionPill[] = [
  {
    id: "employment",
    label: "Employment records",
    activeClass: "bg-purple-100 dark:bg-purple-950/50 text-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-800",
    dotClass: "bg-purple-500",
  },
  {
    id: "pay",
    label: "Pay & compensation",
    activeClass: "bg-teal-100 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200 border-teal-300 dark:border-teal-800",
    dotClass: "bg-teal-500",
  },
  {
    id: "documents",
    label: "Documents",
    activeClass: "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-900 dark:text-yellow-200 border-yellow-300 dark:border-yellow-800",
    dotClass: "bg-yellow-500",
  },
  {
    id: "performance",
    label: "Performance",
    activeClass: "bg-orange-100 dark:bg-orange-950/50 text-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-800",
    dotClass: "bg-orange-500",
  },
  // 2026-06-01: new section for the HR-audit follow-up — workers comp
  // claims + reasonable adjustments. Sits AFTER Performance since it's
  // less frequently visited.
  {
    id: "health",
    label: "Health & WHS",
    activeClass: "bg-rose-100 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-800",
    dotClass: "bg-rose-500",
  },
];

const CLICK_DEBOUNCE_MS = 500;
const SECTION_ANCHOR_PREFIX = "section-";

export function sectionAnchorId(key: StaffProfileSectionKey): string {
  return `${SECTION_ANCHOR_PREFIX}${key}`;
}

export interface StaffProfilePillsProps {
  /** Initial active key, derived from URL hash on the server. Defaults
   *  to the first section when the hash isn't present. */
  initialKey?: StaffProfileSectionKey;
}

export function StaffProfilePills({ initialKey }: StaffProfilePillsProps = {}) {
  const [active, setActive] = useState<StaffProfileSectionKey>(
    initialKey ?? "employment",
  );
  // Timestamp until which scroll-spy updates are ignored — set on
  // programmatic click so the click-driven scroll doesn't compete
  // with the user's intended target.
  const ignoreSpyUntil = useRef<number>(0);

  // On mount: if the URL has a hash like #section-pay, scroll to it +
  // set the active pill.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith(SECTION_ANCHOR_PREFIX)) return;
    const key = hash.slice(SECTION_ANCHOR_PREFIX.length) as StaffProfileSectionKey;
    if (SECTIONS.some((s) => s.id === key)) {
      setActive(key);
      // Defer to after first paint so the DOM exists.
      requestAnimationFrame(() => {
        document.getElementById(sectionAnchorId(key))?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      });
    }
  }, []);

  // IntersectionObserver scroll-spy. Tracks which section is mostly
  // in the viewport and updates `active`. Suppressed for 500ms after
  // a click.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < ignoreSpyUntil.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0),
          );
        const top = visible[0];
        if (!top) return;
        const id = top.target.id.replace(SECTION_ANCHOR_PREFIX, "");
        if (SECTIONS.some((s) => s.id === id)) {
          setActive(id as StaffProfileSectionKey);
        }
      },
      {
        rootMargin: "-25% 0px -50% 0px",
        threshold: [0, 0.25, 0.5],
      },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(sectionAnchorId(s.id));
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  function jumpTo(key: StaffProfileSectionKey) {
    // Date.now() lives inside an event handler, not render — the lint
    // rule can't see that, so silence it here.
    // eslint-disable-next-line react-hooks/purity
    ignoreSpyUntil.current = Date.now() + CLICK_DEBOUNCE_MS;
    setActive(key);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${sectionAnchorId(key)}`);
    }
    document
      .getElementById(sectionAnchorId(key))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-background/90 backdrop-blur border-b border-border"
      aria-label="Profile sections"
      data-testid="staff-profile-pills"
    >
      <div className="flex items-center gap-2 overflow-x-auto">
        {SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => jumpTo(section.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                isActive
                  ? section.activeClass
                  : "bg-card text-muted border-border hover:bg-surface",
              )}
              aria-current={isActive ? "true" : undefined}
              data-section={section.id}
            >
              <span className={cn("h-2 w-2 rounded-full", section.dotClass)} />
              {section.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
