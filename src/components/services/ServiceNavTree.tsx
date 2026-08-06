"use client";

/**
 * The service's own left-hand navigation.
 *
 * Replaces the top tab bar on desktop. The tab bar hid every sub-page
 * behind a group you had to guess first: nine of the ten things a
 * coordinator opens in a day were invisible until you clicked the right
 * one of eight tabs. A tree shows the whole service at once, which is
 * the single thing OWNA's layout gets right.
 *
 * Groups start expanded — collapsing is available, but the default has
 * to be "you can see everything", or we've rebuilt the tab bar with
 * extra steps. The active group is never collapsible for the same
 * reason.
 *
 * The tab bar is still rendered on mobile: a 240px rail on a phone is
 * most of the screen.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubTab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface TabGroup {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  subTabs: SubTab[];
}

export function ServiceNavTree({
  groups,
  activeGroup,
  activeSub,
  onGroupChange,
  onSubChange,
  badgeFor,
}: {
  groups: TabGroup[];
  activeGroup: string;
  activeSub?: string;
  onGroupChange: (key: string) => void;
  onSubChange: (key: string) => void;
  badgeFor?: (groupKey: string) => number | undefined;
}) {
  // Collapsed state is per-group and starts empty — everything open.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <nav
      aria-label="Service sections"
      className="w-56 shrink-0 space-y-0.5 border-r border-border pr-3"
    >
      {groups.map((group) => {
        const isActive = activeGroup === group.key;
        const hasSubs = group.subTabs.length > 0;
        // The group you're in stays open: collapsing it would hide the
        // page you're looking at.
        const isOpen = isActive || !collapsed[group.key];
        const badge = badgeFor?.(group.key);

        return (
          <div key={group.key}>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => onGroupChange(group.key)}
                className={cn(
                  "flex min-h-9 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-brand/10 font-semibold text-brand"
                    : "text-foreground hover:bg-surface",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <group.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                {badge != null && badge > 0 && (
                  <span className="rounded-full bg-brand px-1.5 py-0.5 text-2xs font-semibold text-white">
                    {badge}
                  </span>
                )}
              </button>
              {hasSubs && !isActive && (
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((p) => ({ ...p, [group.key]: !p[group.key] }))
                  }
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${group.label}`}
                  aria-expanded={isOpen}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      !isOpen && "-rotate-90",
                    )}
                  />
                </button>
              )}
            </div>

            {hasSubs && isOpen && (
              <ul className="mb-1 ml-4 border-l border-border pl-2">
                {group.subTabs.map((sub) => {
                  const subActive = isActive && activeSub === sub.key;
                  return (
                    <li key={sub.key}>
                      <button
                        type="button"
                        onClick={() => {
                          // Clicking a sub-page from another group has to
                          // move both, or you land on the wrong tab's
                          // content with the right label highlighted.
                          if (!isActive) onGroupChange(group.key);
                          onSubChange(sub.key);
                        }}
                        className={cn(
                          "flex min-h-8 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors",
                          subActive
                            ? "bg-brand/10 font-semibold text-brand"
                            : "text-muted hover:bg-surface hover:text-foreground",
                        )}
                        aria-current={subActive ? "page" : undefined}
                      >
                        <sub.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate">{sub.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
