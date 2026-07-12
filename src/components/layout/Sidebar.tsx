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
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems, filterNavItems, partitionNavSection } from "@/lib/nav-config";
import { isInductionLocked, isInductionAllowedPath } from "@/lib/induction-lock";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { NavLayoutToggle } from "@/components/layout/NavLayoutToggle";
import { useBookingRequestCount } from "@/hooks/useBookingRequests";
import { useUnreadMessageCount } from "@/hooks/useMessaging";
import { useMyPendingPoliciesCount } from "@/hooks/usePolicies";
import type { Role } from "@prisma/client";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { collapsed, toggleCollapsed, collapsedSections, toggleSection, favourites, toggleFavourite, expandedSections, toggleExpandedSection } = useSidebar();
  const { data: bookingRequestCount } = useBookingRequestCount();
  const { data: unreadMessageCount } = useUnreadMessageCount();
  const { data: pendingPoliciesCount } = useMyPendingPoliciesCount();

  // Close mobile sidebar on route change
  useEffect(() => {
    onMobileClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Induction locked-mode: a new starter (or expired-grace backfill) only sees
  // the induction surfaces in the sidebar, mirroring the middleware redirect.
  const inductionLocked = isInductionLocked(
    session?.user?.inductionStatus,
    session?.user?.inductionGraceUntil
  );

  // Group filtered nav items by section.
  //
  // 2026-07-08: switched from consecutive-run grouping to global Map
  // dedup so a section that appears twice in nav-config (e.g. "Admin"
  // with the Settings run in between) renders as ONE section header,
  // not two. Same fix that landed in TopNav on 2026-06-26 — this
  // closes the parity gap where the sidebar was still rendering
  // "ADMIN › Leadership" then another "ADMIN" further down. Order =
  // first-seen section wins.
  // Badge-carrying items must never be invisible — a live count overrides
  // both the curated-core overflow AND the stage-1 `hidden` fold.
  const forceShowHrefs = useMemo(() => {
    const hrefs: string[] = [];
    if (bookingRequestCount != null && bookingRequestCount > 0) hrefs.push("/bookings");
    if (unreadMessageCount != null && unreadMessageCount > 0) hrefs.push("/messaging");
    if (pendingPoliciesCount?.count != null && pendingPoliciesCount.count > 0) hrefs.push("/policies");
    return hrefs;
  }, [bookingRequestCount, unreadMessageCount, pendingPoliciesCount?.count]);

  const groupedItems = useMemo(() => {
    const filtered = filterNavItems(
      navItems,
      session?.user?.role as Role | undefined
    )
      .filter((item) => !item.hidden || forceShowHrefs.includes(item.href))
      .filter((item) => !inductionLocked || isInductionAllowedPath(item.href));
    const byKey = new Map<string, typeof navItems>();
    const order: string[] = [];
    for (const item of filtered) {
      if (!byKey.has(item.section)) {
        byKey.set(item.section, []);
        order.push(item.section);
      }
      byKey.get(item.section)!.push(item);
    }
    return order.map((key) => ({ key, items: byKey.get(key)! }));
  }, [session?.user?.role, inductionLocked, forceShowHrefs]);

  // Build favourited items list from the filtered nav items
  const favouriteItems = useMemo(() => {
    if (favourites.size === 0) return [];
    const filtered = filterNavItems(
      navItems,
      session?.user?.role as Role | undefined
    )
      .filter((item) => !inductionLocked || isInductionAllowedPath(item.href))
      .filter((item) => favourites.has(item.href));
    return filtered;
  }, [favourites, session?.user?.role, inductionLocked]);

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
          "bg-gradient-to-b from-brand-dark to-[#001824]",
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
            alt="Amana OSHC logo"
            width={28}
            height={40}
            className="flex-shrink-0"
          />
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-semibold tracking-tight truncate">
                Amana OSHC
              </h1>
              <p className="text-2xs text-white/50 uppercase tracking-wider">
                EOS Dashboard
              </p>
            </div>
          )}
          {/* Subtle bottom gradient fade instead of hard border */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="absolute -bottom-2 left-0 right-0 h-2 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
        </div>

        {/* Navigation */}
        <nav aria-label="Main navigation" className="flex-1 py-4 px-2 space-y-1 overflow-y-auto scrollbar-hide">
          {/* Favourites section — only when expanded and has items */}
          {!collapsed && favouriteItems.length > 0 && (
            <div>
              <div className="my-2 px-3">
                <div className="flex items-center gap-1.5">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <h3 className="text-2xs font-semibold text-white/30 uppercase tracking-widest">
                    Favourites
                  </h3>
                </div>
              </div>
              {favouriteItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const Icon = item.icon;

                return (
                  <div key={`fav-${item.href}`} className="relative group/nav">
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-white/[0.08] text-white border-l-2 border-accent ml-0.5"
                          : "text-white/70 hover:bg-white/[0.05] hover:text-white/90 border-l-2 border-transparent ml-0.5"
                      )}
                      title={item.tooltip ?? undefined}
                    >
                      <Icon
                        className={cn(
                          "w-5 h-5 flex-shrink-0 transition-all duration-200",
                          isActive && "drop-shadow-[0_0_6px_rgba(254,206,0,0.4)]"
                        )}
                      />
                      <span className="truncate transition-transform duration-200 group-hover/nav:translate-x-0.5">
                        {item.label}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavourite(item.href);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover/nav:opacity-100 hover:bg-white/10 transition-all duration-150"
                      title="Remove from favourites"
                      aria-label="Remove from favourites"
                    >
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    </button>
                  </div>
                );
              })}

              {/* Separator after favourites */}
              <div className="my-2 px-3">
                <div className="h-px bg-white/[0.06]" />
              </div>
            </div>
          )}

          {groupedItems.map((group, groupIndex) => {
            const isSectionCollapsed = collapsedSections.has(group.key);
            // Curated sidebar (2026-07-12): show the role's core items by
            // default; the rest live behind "+N more". Badge-carrying items
            // are force-shown so a live count is never invisible.
            const { core, overflow } = partitionNavSection(
              group.items,
              session?.user?.role as Role | undefined,
              { activeHref: pathname, forceShowHrefs },
            );
            const isExpanded = expandedSections.has(group.key);
            const visibleItems = isExpanded ? [...core, ...overflow] : core;

            return (
              <div key={group.key}>
                {/* Section header / separator */}
                {groupIndex > 0 && (
                  <div
                    className={cn(
                      // 2026-07-08: bigger top gap + faint separator line
                      // so each section pops as a distinct block. Prior
                      // headers rendered as text-white/30 with no divider
                      // and blended into the item list — Daniel couldn't
                      // scan to a section quickly.
                      "mt-4 mb-1 pt-2 border-t border-white/[0.08]",
                      collapsed ? "px-2" : "px-3"
                    )}
                  >
                    {collapsed ? (
                      <div className="h-px bg-white/[0.06]" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleSection(group.key)}
                        aria-label={`${isSectionCollapsed ? "Expand" : "Collapse"} ${group.key} section`}
                        aria-expanded={!isSectionCollapsed}
                        className="flex items-center justify-between w-full group py-1"
                      >
                        <h3 className="text-xs font-bold text-accent uppercase tracking-widest pl-1">
                          {group.key}
                        </h3>
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-white/40 transition-transform duration-200 group-hover:text-white/70",
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
                  visibleItems.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    const isFavourited = favourites.has(item.href);

                    return (
                      <div key={item.href} className="relative group/nav">
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-white/[0.08] text-white border-l-2 border-accent ml-0.5"
                              : "text-white/70 hover:bg-white/[0.05] hover:text-white/90 border-l-2 border-transparent ml-0.5"
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
                            <>
                              <span className="truncate transition-transform duration-200 group-hover/nav:translate-x-0.5">
                                {item.label}
                              </span>
                              {item.href === "/bookings" && bookingRequestCount != null && bookingRequestCount > 0 && (
                                <span className="ml-auto flex-shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-2xs font-bold text-brand leading-none min-w-[18px] text-center">
                                  {bookingRequestCount > 99 ? "99+" : bookingRequestCount}
                                </span>
                              )}
                              {item.href === "/messaging" && unreadMessageCount != null && unreadMessageCount > 0 && (
                                <span className="ml-auto flex-shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-2xs font-bold text-brand leading-none min-w-[18px] text-center">
                                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                                </span>
                              )}
                              {item.href === "/policies" && pendingPoliciesCount?.count != null && pendingPoliciesCount.count > 0 && (
                                <span
                                  aria-label={`${pendingPoliciesCount.count} acknowledgements required`}
                                  className="ml-auto flex-shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-2xs font-bold text-white leading-none min-w-[18px] text-center"
                                >
                                  {pendingPoliciesCount.count > 99 ? "99+" : pendingPoliciesCount.count}
                                </span>
                              )}
                            </>
                          )}
                        </Link>
                        {/* Star toggle — only when sidebar is expanded */}
                        {!collapsed && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFavourite(item.href);
                            }}
                            className={cn(
                              "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 transition-all duration-150",
                              isFavourited
                                ? "opacity-100"
                                : "opacity-0 group-hover/nav:opacity-100"
                            )}
                            title={isFavourited ? "Remove from favourites" : "Add to favourites"}
                            aria-label={`${isFavourited ? "Remove" : "Add"} ${item.label} ${isFavourited ? "from" : "to"} favourites`}
                          >
                            <Star
                              className={cn(
                                "w-3.5 h-3.5 transition-colors duration-150",
                                isFavourited
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-white/40 hover:text-white/60"
                              )}
                            />
                          </button>
                        )}
                      </div>
                    );
                  })}

                {/* "+N more" — reveals the section's non-core items.
                    Hidden in icon-only mode (the rail stays short; ⌘K and
                    favourites reach everything) and when the accordion is
                    collapsed. */}
                {!collapsed && !isSectionCollapsed && overflow.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleExpandedSection(group.key)}
                    aria-expanded={isExpanded}
                    aria-label={
                      isExpanded
                        ? `Show fewer ${group.key} items`
                        : `Show ${overflow.length} more ${group.key} items`
                    }
                    className="flex items-center gap-2 w-full px-3 py-1.5 ml-0.5 rounded-lg text-2xs font-semibold uppercase tracking-wider text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "w-3 h-3 transition-transform duration-200",
                        isExpanded && "rotate-180"
                      )}
                    />
                    {isExpanded ? "Show less" : `${overflow.length} more`}
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        {/* Theme + Nav Layout toggles */}
        <div className={cn("px-3 pb-1 space-y-1.5", collapsed && "px-1.5")}>
          <ThemeToggle className="w-full justify-center text-white/50 hover:text-white hover:bg-white/10" />
          {!collapsed && <NavLayoutToggle className="w-full justify-center" />}
        </div>

        {/* User Section */}
        <div className="border-t border-white/[0.06] p-3">
          {session?.user && (
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-dark to-[#004D6D] flex items-center justify-center text-xs font-medium ring-1 ring-white/10">
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
                  <p className="text-2xs text-white/40 capitalize">
                    {session.user.role}
                  </p>
                </div>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors duration-200"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Collapse Toggle (desktop only) */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3.5 top-20 w-7 h-5 rounded-full bg-brand-dark/90 backdrop-blur-sm border border-white/15 hidden md:flex items-center justify-center text-white/50 hover:text-white hover:bg-brand-dark transition-all duration-200"
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
