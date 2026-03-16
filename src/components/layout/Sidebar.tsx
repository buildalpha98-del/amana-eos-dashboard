"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo } from "react";
import { useSidebar } from "@/components/layout/SidebarContext";
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessPage } from "@/lib/permissions";
import { navItems } from "@/lib/nav-config";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import type { Role } from "@prisma/client";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { collapsed, toggleCollapsed, collapsedSections, toggleSection } = useSidebar();

  // Close mobile sidebar on route change
  useEffect(() => {
    onMobileClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group filtered nav items by section, preserving order
  const groupedItems = useMemo(() => {
    const filtered = navItems.filter((item) =>
      canAccessPage(session?.user?.role as Role | undefined, item.href)
    );
    const sections: { key: string; items: typeof navItems }[] = [];
    for (const item of filtered) {
      const last = sections[sections.length - 1];
      if (last && last.key === item.section) {
        last.items.push(item);
      } else {
        sections.push({ key: item.section, items: [item] });
      }
    }
    return sections;
  }, [session?.user?.role]);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        data-tour="sidebar"
        className={cn(
          "fixed left-0 top-0 h-screen text-white flex flex-col transition-all duration-300 z-50 backdrop-blur-xl",
          // Rich gradient background
          "bg-gradient-to-b from-[#002E3D] to-[#001824]",
          // Mobile: off-canvas drawer via translate
          "w-64 -translate-x-full md:translate-x-0",
          // Desktop: collapse toggle
          collapsed ? "md:w-16" : "md:w-64",
          // Mobile open: slide in
          mobileOpen && "translate-x-0"
        )}
      >
        {/* Brand Header */}
        <div className="relative flex items-center gap-3 px-4 h-16">
          <Image
            src="/logo-icon-white.svg"
            alt="Amana OSHC"
            width={28}
            height={40}
            className="flex-shrink-0"
          />
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-semibold tracking-tight truncate">
                Amana OSHC
              </h1>
              <p className="text-[10px] text-white/50 uppercase tracking-wider">
                EOS Dashboard
              </p>
            </div>
          )}
          {/* Subtle bottom gradient fade instead of hard border */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="absolute -bottom-2 left-0 right-0 h-2 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto scrollbar-hide">
          {groupedItems.map((group, groupIndex) => {
            const isSectionCollapsed = collapsedSections.has(group.key);

            return (
              <div key={group.key}>
                {/* Section header / separator */}
                {groupIndex > 0 && (
                  <div
                    className={cn(
                      "my-2",
                      collapsed ? "px-2" : "px-3"
                    )}
                  >
                    {collapsed ? (
                      <div className="h-px bg-white/[0.06]" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleSection(group.key)}
                        className="flex items-center justify-between w-full group"
                      >
                        <h3 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest pl-1">
                          {group.key}
                        </h3>
                        <ChevronDown
                          className={cn(
                            "w-3 h-3 text-white/20 transition-transform duration-200 group-hover:text-white/40",
                            isSectionCollapsed && "-rotate-90"
                          )}
                        />
                      </button>
                    )}
                  </div>
                )}

                {/* Nav items: always visible when sidebar is collapsed (icon-only mode),
                    otherwise respect section accordion state */}
                {(collapsed || !isSectionCollapsed) &&
                  group.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      pathname.startsWith(item.href + "/");
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group/nav flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-white/[0.08] text-white border-l-2 border-[#FECE00] ml-0.5"
                            : "text-white/60 hover:bg-white/[0.05] hover:text-white/90 border-l-2 border-transparent ml-0.5"
                        )}
                        title={
                          collapsed
                            ? item.label
                            : "tooltip" in item && item.tooltip
                              ? (item.tooltip as string)
                              : undefined
                        }
                      >
                        <Icon
                          className={cn(
                            "w-5 h-5 flex-shrink-0 transition-all duration-200",
                            isActive && "drop-shadow-[0_0_6px_rgba(254,206,0,0.4)]"
                          )}
                        />
                        {!collapsed && (
                          <span className="truncate transition-transform duration-200 group-hover/nav:translate-x-0.5">
                            {item.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
              </div>
            );
          })}
        </nav>

        {/* Theme Toggle */}
        <div className={cn("px-3 pb-1", collapsed && "px-1.5")}>
          <ThemeToggle className="w-full justify-center text-white/50 hover:text-white hover:bg-white/10" />
        </div>

        {/* User Section */}
        <div className="border-t border-white/[0.06] p-3">
          {session?.user && (
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#002E3D] to-[#004D6D] flex items-center justify-center text-xs font-medium ring-1 ring-white/10">
                {session.user.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              {!collapsed && (
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium truncate">
                    {session.user.name}
                  </p>
                  <p className="text-[10px] text-white/40 capitalize">
                    {session.user.role}
                  </p>
                </div>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors duration-200"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Collapse Toggle (desktop only) */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3.5 top-20 w-7 h-5 rounded-full bg-[#002E3D]/90 backdrop-blur-sm border border-white/15 hidden md:flex items-center justify-center text-white/50 hover:text-white hover:bg-[#002E3D] transition-all duration-200"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>
      </aside>
    </>
  );
}
