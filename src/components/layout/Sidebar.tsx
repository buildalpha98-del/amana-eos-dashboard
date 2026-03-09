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
        className={cn(
          "fixed left-0 top-0 h-screen bg-[#003344] text-white flex flex-col transition-all duration-300 z-50",
          // Mobile: off-canvas drawer via translate
          "w-64 -translate-x-full md:translate-x-0",
          // Desktop: collapse toggle
          collapsed ? "md:w-16" : "md:w-64",
          // Mobile open: slide in
          mobileOpen && "translate-x-0"
        )}
      >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
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
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
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
                    <div className="h-px bg-white/10" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSection(group.key)}
                      className="flex items-center justify-between w-full group"
                    >
                      <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider pl-1">
                        {group.key}
                      </h3>
                      <ChevronDown
                        className={cn(
                          "w-3 h-3 text-white/30 transition-transform duration-200 group-hover:text-white/50",
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
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150",
                        isActive
                          ? "bg-white/10 text-[#FECE00]"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      )}
                      title={
                        collapsed
                          ? item.label
                          : "tooltip" in item && item.tooltip
                            ? (item.tooltip as string)
                            : undefined
                      }
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="border-t border-white/10 p-3">
        {session?.user && (
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#004E64] flex items-center justify-center text-xs font-medium">
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
                <p className="text-[10px] text-white/50 capitalize">
                  {session.user.role}
                </p>
              </div>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
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
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#003344] border border-white/20 hidden md:flex items-center justify-center text-white/60 hover:text-white transition-colors"
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
