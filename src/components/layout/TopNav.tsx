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

  // Group nav items by section in source order — same as the sidebar.
  const grouped = useMemo(() => {
    const filtered = filterNavItems(
      navItems,
      session?.user?.role as Role | undefined,
    );
    const sections: { key: string; items: NavItem[] }[] = [];
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
      className="sticky top-0 z-40 bg-gradient-to-r from-[#002E3D] to-[#001824] text-white shadow-sm"
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

        {/* Section dropdowns — desktop only */}
        <nav
          aria-label="Main navigation"
          className="hidden md:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide"
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
                  <div className="absolute left-0 top-full mt-1 min-w-[240px] max-w-[320px] bg-card text-foreground border border-border rounded-lg shadow-xl py-1.5 z-50">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const itemActive =
                        pathname === item.href ||
                        pathname.startsWith(item.href + "/");
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpenSection(null)}
                          className={cn(
                            "flex items-start gap-2.5 px-3 py-2 text-sm hover:bg-surface transition-colors",
                            itemActive && "bg-brand/5 text-brand font-medium",
                          )}
                          title={item.tooltip}
                        >
                          <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted" />
                          <div className="min-w-0">
                            <p className="truncate">{item.label}</p>
                            {item.tooltip && (
                              <p className="text-[11px] text-muted line-clamp-2 mt-0.5">
                                {item.tooltip}
                              </p>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
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
