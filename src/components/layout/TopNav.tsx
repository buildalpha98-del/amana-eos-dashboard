"use client";

/**
 * OWNA-style top bar nav. Each section from `nav-config` becomes a
 * dropdown button — click to open, click an item to navigate.
 *
 * Mobile (under md) hides the section row entirely; the existing
 * mobile drawer (driven by the hamburger in the dashboard layout)
 * still works because `Sidebar` continues to mount in mobile mode
 * via the same `mobileOpen` flag. That lets us keep the OWNA-style
 * top bar without rebuilding mobile nav from scratch.
 *
 * Rendering vs. Sidebar is decided by `useNavLayout()` in the
 * dashboard layout — this component is mounted ONLY when the user
 * has opted into the top-bar layout.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems, filterNavItems, type NavItem } from "@/lib/nav-config";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { NavLayoutToggle } from "@/components/layout/NavLayoutToggle";
import type { Role } from "@prisma/client";

interface TopNavProps {
  onMobileMenu?: () => void;
}

export function TopNav({ onMobileMenu }: TopNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Group nav items by section. Unlike the sidebar (which respects
  // source order so it can interleave grouped + standalone items),
  // the top bar must have each section appear EXACTLY ONCE — same
  // section name with non-consecutive items in nav-config would
  // otherwise spawn duplicate top-bar tabs (Daniel reported a
  // duplicate "Operations" + "Admin" on 2026-06-26).
  const grouped = useMemo(() => {
    const filtered = filterNavItems(
      navItems,
      session?.user?.role as Role | undefined,
    );
    const byKey = new Map<string, NavItem[]>();
    const order: string[] = [];
    for (const item of filtered) {
      if (!byKey.has(item.section)) {
        byKey.set(item.section, []);
        order.push(item.section);
      }
      byKey.get(item.section)!.push(item);
    }
    return order.map((key) => ({ key, items: byKey.get(key)! }));
  }, [session?.user?.role]);

  // Close the open dropdown when the user clicks outside / presses Esc /
  // navigates to a new page.
  useEffect(() => {
    setOpenSection(null);
  }, [pathname]);

  useEffect(() => {
    if (!openSection) return;
    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenSection(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenSection(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [openSection]);

  const activeSection = useMemo(() => {
    for (const section of grouped) {
      for (const item of section.items) {
        if (
          pathname === item.href ||
          pathname.startsWith(item.href + "/")
        ) {
          return section.key;
        }
      }
    }
    return null;
  }, [grouped, pathname]);

  return (
    <header
      ref={navRef}
      data-tour="topnav"
      className="sticky top-0 z-40 bg-gradient-to-r from-brand-dark to-[#001824] text-white shadow-sm"
    >
      <div className="flex items-center px-3 sm:px-4 h-12">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenu}
          aria-label="Open navigation menu"
          className="md:hidden p-2 -ml-1 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 mr-4 shrink-0"
        >
          <Image
            src="/logo-icon-white.svg"
            alt="Amana OSHC"
            width={20}
            height={28}
            className="flex-shrink-0"
          />
          <span className="hidden sm:inline text-sm font-semibold tracking-tight">
            Amana OSHC
          </span>
        </Link>

        {/* Section dropdowns — desktop only.
            NOTE: cannot use `overflow-x-auto` here — browsers treat
            any non-visible overflow axis as clipping for BOTH axes,
            which would hide the dropdowns that drop below the nav
            (Daniel reported this 2026-06-26). Use flex-wrap as the
            overflow strategy instead; for the current section count
            (~6) it fits a single row at all desktop widths anyway. */}
        <nav
          aria-label="Main navigation"
          className="hidden md:flex flex-wrap items-center gap-1 flex-1 min-w-0"
        >
          {grouped.map((section) => {
            const isOpen = openSection === section.key;
            const isActive = activeSection === section.key;
            return (
              <div key={section.key} className="relative">
                <button
                  onClick={() =>
                    setOpenSection(isOpen ? null : section.key)
                  }
                  className={cn(
                    "inline-flex items-center gap-1 px-3 h-9 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {section.key}
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                {isOpen && (
                  <SectionDropdown
                    items={section.items}
                    pathname={pathname}
                    onClose={() => setOpenSection(null)}
                  />
                )}
              </div>
            );
          })}
        </nav>

        {/* Right-side utility actions */}
        <div className="flex items-center gap-1 ml-auto pl-2 shrink-0">
          <NavLayoutToggle className="hidden md:inline-flex" />
          <ThemeToggle />
          <Link
            href="/profile"
            className="hidden sm:inline-flex items-center text-xs font-medium text-white/80 hover:text-white px-2 h-8 rounded-md hover:bg-white/10"
          >
            {session?.user?.name ?? "Profile"}
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Sign out"
            className="p-2 rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Dropdown rendered under each top-bar section button. Small sections
 * (<= 8 items) get a single column with rich item descriptions.
 * Larger sections (Admin has 23, Growth 17) get a compact two-column
 * layout so the dropdown stays scannable without scrolling — same
 * pattern OWNA HQ uses for Children/Attendances.
 */
function SectionDropdown({
  items,
  pathname,
  onClose,
}: {
  items: NavItem[];
  pathname: string;
  onClose: () => void;
}) {
  const TWO_COLUMN_THRESHOLD = 9;
  const twoCol = items.length >= TWO_COLUMN_THRESHOLD;

  return (
    <div
      className={cn(
        "absolute left-0 top-full mt-1 bg-card text-foreground border border-border rounded-lg shadow-xl py-1.5 z-50",
        twoCol
          ? "w-[520px] grid grid-cols-2 gap-x-1"
          : "min-w-[260px] max-w-[340px]",
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const itemActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2 text-sm hover:bg-surface transition-colors rounded-md",
              itemActive && "bg-brand/5 text-brand font-medium",
            )}
            title={item.tooltip}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate">{item.label}</p>
              {!twoCol && item.tooltip && (
                <p className="text-xs text-muted line-clamp-2 mt-0.5">
                  {item.tooltip}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
