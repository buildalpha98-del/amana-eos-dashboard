"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  LayoutDashboard,
  CheckSquare,
  Building2,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  // 2026-07-06 design system: My Day leads — educators on phones land
  // on their during-session surface (clock, roll call, checklists).
  { href: "/my-day", label: "My Day", icon: Sun },
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/todos", label: "To-Dos", icon: CheckSquare },
  { href: "/services", label: "Services", icon: Building2 },
] as const;

interface MobileTabBarProps {
  onMorePress: () => void;
}

export function MobileTabBar({ onMorePress }: MobileTabBarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-background border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[64px]",
                isActive
                  ? "text-brand"
                  : "text-muted hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5",
                  isActive && "drop-shadow-[0_0_4px_rgba(0,78,100,0.3)]"
                )}
              />
              <span
                className={cn(
                  "text-[10px] leading-tight",
                  isActive ? "font-semibold" : "font-medium"
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* More button — opens sidebar */}
        <button
          type="button"
          onClick={onMorePress}
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[64px] text-muted hover:text-foreground"
          aria-label="Open full navigation menu"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] leading-tight font-medium">More</span>
        </button>
      </div>
    </nav>
  );
}
