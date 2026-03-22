"use client";

import { useRef, useEffect } from "react";

interface Tab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MarketingTabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}

export function MarketingTabs({ tabs, active, onChange }: MarketingTabsProps) {
  const navRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active tab into view on mount / tab change
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const activeBtn = nav.querySelector<HTMLButtonElement>(
      `[data-tab-key="${active}"]`
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [active]);

  return (
    <div className="relative border-b border-border">
      {/* Left gradient fade (mobile only) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent z-10 md:hidden" />
      {/* Right gradient fade (mobile only) */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent z-10 md:hidden" />

      <nav
        ref={navRef}
        className="flex gap-1 sm:gap-4 md:gap-6 -mb-px overflow-x-auto scrollbar-hide"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              data-tab-key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`flex items-center gap-2 py-3 px-2 sm:px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                isActive
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
