"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Plus, Search } from "lucide-react";
import { getCurrentQuarter } from "@/lib/utils";
import { QuickAddMenu, type QuickAddMenuPosition } from "./QuickAddMenu";
import { CommandPalette } from "./CommandPalette";
import { navItems } from "@/lib/nav-config";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { useRecentPages } from "@/hooks/useRecentPages";

const CentreSwitcher = dynamic(
  () => import("./CentreSwitcher").then((m) => m.CentreSwitcher),
  { ssr: false }
);

const NotificationBell = dynamic(
  () => import("./NotificationBell").then((m) => m.NotificationBell),
  { ssr: false }
);

const quarterRelevantPages = new Set([
  "/dashboard",
  "/vision",
  "/rocks",
  "/todos",
  "/issues",
  "/scorecard",
  "/meetings",
  "/financials",
  "/performance",
]);

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/vision": "Vision / V-TO",
  "/rocks": "Rocks",
  "/todos": "To-Dos",
  "/issues": "Issues",
  "/scorecard": "Scorecard",
  "/meetings": "Meetings",
  "/financials": "Financials",
  "/performance": "Performance",
  "/services": "Services",
  "/projects": "Projects",
  "/tickets": "Tickets",
  "/documents": "Documents",
  "/team": "Team",
  "/settings": "Settings",
  "/communication": "Communication",
  "/marketing": "Marketing",
  "/onboarding": "Onboarding",
  "/compliance": "Compliance",
  "/timesheets": "Timesheets",
  "/leave": "Leave",
  "/contracts": "Contracts",
  "/crm": "CRM",
  "/crm/templates": "Email Templates",
  "/activity-library": "Activity Library",
  "/my-portal": "My Portal",
  "/profile": "Profile",
  "/holiday-quest": "Holiday Quest",
  "/scenarios": "Scenarios",
  "/data-room": "Data Room",
  "/reports/board": "Board Reports",
  "/assistant": "AI Assistant",
  "/enquiries": "Enquiries",
  "/enrolments": "Enrolments",
  "/children": "Children",
  "/conversions": "Conversions",
  "/recruitment": "Recruitment",
  "/tools/ccs-calculator": "CCS Calculator",
  "/tools/the-amana-way": "The Amana Way",
  "/tools/amana-way-one-pager": "Amana Way One Pager",
  "/tools/employee-handbook": "Employee Handbook",
  "/compliance/templates": "Audit Templates",
  "/automations": "Automations",
  "/audit-log": "Audit Log",
  "/getting-started": "Getting Started",
  "/guides": "Quick-Start Guides",
  "/help": "Help Centre",
  "/directory": "Staff Directory",
  "/queue": "My Queue",
  "/incidents": "Incidents",
  "/queue/all": "All Queues",
  "/marketing/email/compose": "Compose Email",
  "/policies": "Policies",
};

/** Build a nav-item lookup from href to label */
const navLabelMap: Record<string, string> = Object.fromEntries(
  navItems.map((item) => [item.href, item.label])
);

export function TopBar() {
  const pathname = usePathname();
  const { recentPages, trackPage } = useRecentPages();

  const title = useMemo(() => {
    if (pageTitles[pathname]) return pageTitles[pathname];
    // Dynamic detail pages
    if (pathname.startsWith("/services/") && pathname !== "/services") return "Service Detail";
    if (pathname.startsWith("/crm/") && pathname !== "/crm" && !pathname.startsWith("/crm/templates")) return "Lead Detail";
    if (pathname.startsWith("/recruitment/") && pathname !== "/recruitment") return "Vacancy Detail";
    if (pathname.startsWith("/tickets/") && pathname !== "/tickets") return "Ticket Detail";
    return "Dashboard";
  }, [pathname]);
  const quarter = getCurrentQuarter();

  // Build breadcrumb items for nested pages (2+ segments)
  const breadcrumbItems = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null; // single-segment — no breadcrumbs

    const items: Array<{ label: string; href?: string }> = [];
    // Build parent path(s)
    for (let i = 0; i < segments.length - 1; i++) {
      const parentPath = "/" + segments.slice(0, i + 1).join("/");
      const parentLabel = pageTitles[parentPath] || navLabelMap[parentPath] || segments[i].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      items.push({ label: parentLabel, href: parentPath });
    }
    // Current page (no link)
    items.push({ label: title });
    return items;
  }, [pathname, title]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<QuickAddMenuPosition>({ top: 0, right: 0 });
  const [searchOpen, setSearchOpen] = useState(false);

  // Close quick-add on route change
  useEffect(() => {
    setQuickAddOpen(false);
  }, [pathname]);

  // Track recent pages on route change
  useEffect(() => {
    if (title) {
      trackPage(pathname, title);
    }
  }, [pathname, title, trackPage]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape" && quickAddOpen) {
        setQuickAddOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quickAddOpen]);

  // Toggle quick-add and capture position from the clicked button
  const handleQuickAddClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    // Capture rect BEFORE entering setState — React nullifies currentTarget asynchronously
    const rect = e.currentTarget.getBoundingClientRect();
    setQuickAddOpen((prev) => {
      if (!prev) {
        setMenuPosition({
          top: rect.bottom + 8,
          right: Math.max(8, window.innerWidth - rect.right),
        });
      }
      return !prev;
    });
  }, []);

  const closeQuickAdd = () => setQuickAddOpen(false);

  const quickAddBtnClasses = "p-2 rounded-lg text-white bg-brand hover:bg-brand-hover shadow-warm-sm hover:shadow-warm hover:scale-105 active:scale-95 transition-all";

  return (
    <>
      {/* Desktop header */}
      <header className="h-16 bg-background border-b border-border hidden md:flex items-center justify-between px-6 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          {breadcrumbItems ? (
            <Breadcrumb items={breadcrumbItems} />
          ) : (
            <h1 className="text-2xl font-heading font-semibold tracking-tight text-foreground">{title}</h1>
          )}
          {quarterRelevantPages.has(pathname) && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/20 text-brand border border-accent/30">
              {quarter}
            </span>
          )}
          <CentreSwitcher />
        </div>

        <div className="flex items-center gap-2">
          <button
            data-tour="search"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted bg-surface rounded-xl hover:border-border transition-colors"
            title="Search (Cmd+K)"
          >
            <Search className="w-4 h-4" />
            <span className="hidden md:inline">Search...</span>
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-muted bg-card rounded border-border border">
              ⌘K
            </kbd>
          </button>

          <button data-tour="quick-add" onClick={handleQuickAddClick} className={quickAddBtnClasses} title="Quick Add" aria-label="Quick add">
            <Plus className="w-4 h-4" />
          </button>

          <span data-tour="notifications"><NotificationBell /></span>
        </div>
      </header>

      {/* Mobile utility buttons — portalled into the fixed header bar */}
      <MobileHeaderActions>
        <button
          onClick={() => setSearchOpen(true)}
          className="p-2 rounded-lg text-muted hover:bg-surface transition-colors"
          title="Search"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>
        <button onClick={handleQuickAddClick} className="p-1.5 rounded-lg text-white bg-brand hover:bg-brand-hover transition-all" title="Quick Add" aria-label="Quick add">
          <Plus className="w-3.5 h-3.5" />
        </button>
        <NotificationBell />
      </MobileHeaderActions>

      {/* Single QuickAddMenu — rendered at root level to avoid stacking context issues */}
      <QuickAddMenu open={quickAddOpen} onClose={closeQuickAdd} position={menuPosition} />

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} recentPages={recentPages} />
    </>
  );
}

// ─── Portal for mobile header utility buttons ─────────────

function MobileHeaderActions({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById("mobile-header-actions"));
  }, []);

  if (!container) return null;
  return createPortal(
    <div className="flex items-center gap-1">{children}</div>,
    container
  );
}
