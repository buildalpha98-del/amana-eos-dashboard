"use client";

/**
 * Tabs across the top of a combined staff page — My Pay & Leave, My
 * Training & Compliance (2026-10-08, Daniel: fewer, fuller pages instead
 * of one sidebar item per screen). URL-synced via ?tab= so a link, a
 * redirect from the old address, or the browser back button all land on
 * the right one. Big, thumb-sized targets: this is used on phones.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export interface HubTab {
  key: string;
  label: string;
}

export function useHubTab(tabs: readonly HubTab[]): string {
  const params = useSearchParams();
  const asked = params.get("tab");
  return tabs.find((t) => t.key === asked)?.key ?? tabs[0].key;
}

export function HubTabs({
  tabs,
  active,
  label,
}: {
  tabs: readonly HubTab[];
  active: string;
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="mx-auto mb-6 max-w-5xl">
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`${pathname}?tab=${t.key}`}
            scroll={false}
            aria-current={active === t.key ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors",
              active === t.key
                ? "bg-brand text-white"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
