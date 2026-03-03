"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Plus, Search } from "lucide-react";
import { getCurrentQuarter } from "@/lib/utils";
import { QuickAddMenu } from "./QuickAddMenu";
import { CommandPalette } from "./CommandPalette";

const NotificationDropdown = dynamic(
  () => import("@/components/notifications/NotificationDropdown").then((m) => m.NotificationDropdown),
  { ssr: false }
);

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
};

export function TopBar() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Dashboard";
  const quarter = getCurrentQuarter();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd+K keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header className="h-16 bg-white border-b border-gray-200 hidden md:flex items-center justify-between px-6 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#004E64]/10 text-[#004E64]">
            {quarter}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            title="Search (Cmd+K)"
          >
            <Search className="w-4 h-4" />
            <span className="hidden md:inline">Search...</span>
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-white rounded border">
              ⌘K
            </kbd>
          </button>

          {/* Quick Add */}
          <div className="relative">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setQuickAddOpen((v) => !v)}
              className="p-2 rounded-lg text-white bg-[#004E64] hover:bg-[#003D52] transition-colors"
              title="Quick Add"
            >
              <Plus className="w-4 h-4" />
            </button>
            <QuickAddMenu
              open={quickAddOpen}
              onClose={() => setQuickAddOpen(false)}
            />
          </div>

          {/* Notifications */}
          <NotificationDropdown />
        </div>
      </header>

      {/* Mobile inline sub-header: page title + quick actions below the fixed mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base font-semibold text-gray-900 truncate">{title}</h1>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#004E64]/10 text-[#004E64] shrink-0">
            {quarter}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>
          <div className="relative">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setQuickAddOpen((v) => !v)}
              className="p-2 rounded-lg text-white bg-[#004E64] hover:bg-[#003D52] transition-colors"
              title="Quick Add"
            >
              <Plus className="w-4 h-4" />
            </button>
            <QuickAddMenu
              open={quickAddOpen}
              onClose={() => setQuickAddOpen(false)}
            />
          </div>
          <NotificationDropdown />
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
