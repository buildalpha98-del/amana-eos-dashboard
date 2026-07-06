"use client";

/**
 * HubRail — desktop left-rail navigation for hub pages with many tabs
 * (2026-07-06 design system). Pages with 8+ tabs burn two horizontal
 * rows (tab bar + sub-pills) on wide screens; the rail reclaims that
 * space. Render it `hidden lg:block` next to the existing horizontal
 * tab bar (`lg:hidden`) — same config, two presentations, mobile keeps
 * the swipeable bar.
 */

import { cn } from "@/lib/utils";

export interface HubRailTab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function HubRail({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: HubRailTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Section"
      className={cn("w-44 flex-shrink-0 space-y-0.5", className)}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              isActive
                ? "bg-brand/10 text-brand"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
