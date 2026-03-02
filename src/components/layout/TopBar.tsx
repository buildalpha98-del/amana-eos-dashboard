"use client";

import { usePathname } from "next/navigation";
import { Plus, Search, Bell } from "lucide-react";
import { getCurrentQuarter } from "@/lib/utils";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/vision": "Vision / V-TO",
  "/rocks": "Rocks",
  "/todos": "To-Dos",
  "/issues": "Issues",
  "/scorecard": "Scorecard",
  "/meetings": "Meetings",
  "/team": "Team",
  "/settings": "Settings",
};

export function TopBar() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Dashboard";
  const quarter = getCurrentQuarter();

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#004E64]/10 text-[#004E64]">
          {quarter}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <button
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
        <button
          className="p-2 rounded-lg text-white bg-[#004E64] hover:bg-[#003D52] transition-colors"
          title="Quick Add"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Notifications */}
        <button
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors relative"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
