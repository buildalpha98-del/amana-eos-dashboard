"use client";

/**
 * The main sidebar for a shared CENTRE mailbox login (2026-10-08, Daniel —
 * OWNA style): instead of a generic menu beside the centre page's own
 * menu, the sidebar IS the centre — Today, Service Information, Staff,
 * Families, Daily Ops, Program, EOS, Compliance, Finance, Documents — each
 * opening to its pages, with Notifications and Handbook & Help below.
 *
 * Built from src/lib/service-sections.ts — the same list the centre page
 * uses — so the two can't drift. Links set ?tab=&sub= on /services/[id];
 * the page follows the URL (and hides its own menu for these accounts).
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell, BookOpen, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasMinRole, isAdminRole } from "@/lib/role-permissions";
import { visibleServiceSections, type TabGroup } from "@/lib/service-sections";
import type { Role } from "@prisma/client";

const linkBase =
  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border-l-2 ml-0.5";
const linkActive = "bg-white/[0.08] text-white border-accent";
const linkIdle = "text-white/70 hover:bg-white/[0.05] hover:text-white/90 border-transparent";

export function CentreSidebarNav({
  serviceId,
  collapsed,
  onNavigate,
}: {
  serviceId: string;
  collapsed: boolean;
  /** Closes the phone drawer — links here change ?tab= on the same page,
   *  which the sidebar's pathname-based auto-close doesn't notice. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;

  const sections = visibleServiceSections({
    isAdminPlus: hasMinRole(role, "admin"),
    canSeeCasualBookings: isAdminRole(role) || role === "member",
    canSeeStaffFiles: isAdminRole(role) || role === "member",
  });

  const base = `/services/${serviceId}`;
  const onCentre = pathname === base;
  const activeTab = onCentre ? searchParams.get("tab") || "today" : null;
  const activeSub = searchParams.get("sub");

  // The active section starts open, but a tap ALWAYS toggles — including
  // the one you're on (Daniel couldn't collapse Service Information while
  // inside it). An explicit choice per section beats the default.
  const [choice, setChoice] = useState<Record<string, boolean>>({});
  const isSectionOpen = (key: string) => choice[key] ?? key === activeTab;
  const toggle = (key: string) =>
    setChoice((prev) => ({ ...prev, [key]: !(prev[key] ?? key === activeTab) }));

  const hrefFor = (g: TabGroup, subKey?: string) => {
    if (g.key === "today") return base;
    const sub = subKey ?? g.subTabs[0]?.key;
    return sub ? `${base}?tab=${g.key}&sub=${sub}` : `${base}?tab=${g.key}`;
  };

  return (
    <div className="space-y-1" data-testid="centre-sidebar-nav">
      {!collapsed && (
        <p className="px-3 pb-1 text-2xs font-semibold uppercase tracking-wider text-accent">My Centre</p>
      )}
      {sections.map((g) => {
        const Icon = g.icon;
        const isActive = activeTab === g.key;
        const hasSubs = g.subTabs.length > 0;
        const isOpen = !collapsed && hasSubs && isSectionOpen(g.key);

        if (!hasSubs || collapsed) {
          return (
            <Link
              key={g.key}
              href={hrefFor(g)}
              onClick={onNavigate}
              className={cn(linkBase, isActive ? linkActive : linkIdle)}
              title={collapsed ? g.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">{g.label}</span>}
            </Link>
          );
        }

        return (
          <div key={g.key}>
            <button
              type="button"
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              className={cn(linkBase, "w-full", isActive ? linkActive : linkIdle)}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="truncate flex-1 text-left">{g.label}</span>
              <ChevronDown
                className={cn("w-4 h-4 transition-transform duration-200", isOpen ? "" : "-rotate-90")}
                aria-hidden
              />
            </button>
            {isOpen && (
              <div className="mt-0.5 mb-1 space-y-0.5">
                {g.subTabs.map((s) => {
                  const subActive = isActive && (activeSub ?? g.subTabs[0]?.key) === s.key;
                  return (
                    <Link
                      key={s.key}
                      href={hrefFor(g, s.key)}
                      onClick={onNavigate}
                      className={cn(
                        "block rounded-lg py-1.5 pl-11 pr-3 text-sm transition-colors",
                        subActive
                          ? "text-white font-medium bg-white/[0.06]"
                          : "text-white/60 hover:text-white/90 hover:bg-white/[0.04]",
                      )}
                    >
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="my-2 px-3">
        <div className="h-px bg-white/[0.06]" />
      </div>
      {[
        { href: "/notifications", label: "Notifications", icon: Bell },
        { href: "/handbook", label: "Handbook & Help", icon: BookOpen },
      ].map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(linkBase, isActive ? linkActive : linkIdle)}
            title={collapsed ? label : undefined}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </div>
  );
}
