"use client";

/**
 * SectionShell — common card+sub-tabs wrapper for the 4 long-scroll
 * profile sections (Employment / Pay / Documents / Performance).
 * Standardises the section header (coloured dot + title), sub-tab
 * bar styling, and the `id={section-<key>}` anchor that the sticky
 * pills above scroll-spy onto.
 *
 * 2026-05-04: introduced (spec PR #77, PR 3).
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { sectionAnchorId, type StaffProfileSectionKey } from "@/components/staff/StaffProfilePills";

export interface SectionSubTab<TKey extends string> {
  key: TKey;
  label: string;
}

export interface SectionShellProps<TKey extends string> {
  sectionKey: StaffProfileSectionKey;
  title: string;
  /** Tailwind colour token applied to the section dot + active tab pill. */
  accentDotClass: string;
  accentActiveClass: string;
  subTabs: ReadonlyArray<SectionSubTab<TKey>>;
  defaultTab?: TKey;
  children: (active: TKey) => React.ReactNode;
}

export function SectionShell<TKey extends string>({
  sectionKey,
  title,
  accentDotClass,
  accentActiveClass,
  subTabs,
  defaultTab,
  children,
}: SectionShellProps<TKey>) {
  const initial = defaultTab ?? subTabs[0].key;
  const [active, setActive] = useState<TKey>(initial);

  return (
    <section
      id={sectionAnchorId(sectionKey)}
      className="rounded-xl border border-border bg-card p-5 mb-6 scroll-mt-20"
      data-testid={`section-${sectionKey}`}
    >
      <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={cn("h-2 w-2 rounded-full", accentDotClass)} />
          {title}
        </h2>
        <nav
          className="flex items-center gap-1 overflow-x-auto"
          role="tablist"
          aria-label={`${title} sub-tabs`}
        >
          {subTabs.map((t) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(t.key)}
                data-subtab={t.key}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? accentActiveClass
                    : "bg-card text-muted border-border hover:bg-surface",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="min-h-[12rem]">{children(active)}</div>
    </section>
  );
}
