"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Plus, Search } from "lucide-react";
import { getCurrentQuarter } from "@/lib/utils";
import { QuickAddMenu, type QuickAddMenuPosition } from "./QuickAddMenu";
import { CommandPalette } from "./CommandPalette";

const NotificationDropdown = dynamic(
  () => import("@/components/notifications/NotificationDropdown").then((m) => m.NotificationDropdown),
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
  "/conversions": "Conversions",
  "/recruitment": "Recruitment",
  "/tools/ccs-calculator": "CCS Calculator",
  "/tools/the-amana-way": "The Amana Way",
  "/compliance/templates": "Audit Templates",
  "/audit-log": "Audit Log",
  "/getting-started": "Getting Started",
  "/help": "Help Centre",
  "/directory": "Staff Directory",
  "/queue": "My Queue",
  "/queue/all": "All Queues",
};

export function TopBar() {
  const pathname = usePathname();
  const title =
    pageTitles[pathname] ||
    (pathname.startsWith("/services/") && pathname !== "/services"
      ? "Service Detail"
      : "Dashboard");
  const quarter = getCurrentQuarter();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<QuickAddMenuPosition>({ top: 0, right: 0 });
  const [searchOpen, setSearchOpen] = useState(false);

  // Close quick-add on route change
  useEffect(() => {
    setQuickAddOpen(false);
  }, [pathname]);

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
          <h1 className="text-2xl font-heading font-semibold tracking-tight text-gray-900">{title}</h1>
          {quarterRelevantPages.has(pathname) && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/20 text-brand border border-accent/30">
              {quarter}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            data-tour="search"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-surface rounded-xl hover:border-border transition-colors"
            title="Search (Cmd+K)"
          >
            <Search className="w-4 h-4" />
            <span className="hidden md:inline">Search...</span>
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-card rounded border-border border">
              ⌘K
            </kbd>
          </button>

          <button data-tour="quick-add" onClick={handleQuickAddClick} className={quickAddBtnClasses} title="Quick Add">
            <Plus className="w-4 h-4" />
          </button>

          <span data-tour="notifications"><NotificationDropdown /></span>
        </div>
      </header>

      {/* Mobile sub-header — sticky below the fixed mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-2 bg-background border-b border-border sticky top-14 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base font-heading font-semibold tracking-tight text-gray-900 truncate">{title}</h1>
          {quarterRelevantPages.has(pathname) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/20 text-brand border border-accent/30 shrink-0">
              {quarter}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>
          <button onClick={handleQuickAddClick} className={quickAddBtnClasses} title="Quick Add">
            <Plus className="w-4 h-4" />
          </button>
          <NotificationDropdown />
        </div>
      </div>

      {/* Single QuickAddMenu — rendered at root level to avoid stacking context issues */}
      <QuickAddMenu open={quickAddOpen} onClose={closeQuickAdd} position={menuPosition} />

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
