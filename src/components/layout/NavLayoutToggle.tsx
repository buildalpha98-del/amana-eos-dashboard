"use client";

import { useNavLayout } from "@/hooks/useNavLayout";
import { PanelLeft, LayoutPanelTop } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two-state toggle for the dashboard navigation layout —
 * left Sidebar vs OWNA-style Top Bar. Persisted per-user via
 * localStorage (`useNavLayout`). Reload-free: clicking immediately
 * swaps the layout because the dashboard layout reads the same hook.
 *
 * Rendered in both layouts' footer/utility area so the user always
 * has an obvious way back.
 */
export function NavLayoutToggle({ className }: { className?: string }) {
  const { layout, setLayout } = useNavLayout();

  return (
    <div
      role="group"
      aria-label="Navigation layout"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md p-0.5 bg-white/5 border border-white/10",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setLayout("sidebar")}
        title="Use the left sidebar layout"
        aria-pressed={layout === "sidebar"}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors",
          layout === "sidebar"
            ? "bg-white/15 text-white"
            : "text-white/60 hover:text-white",
        )}
      >
        <PanelLeft className="w-3 h-3" />
        Sidebar
      </button>
      <button
        type="button"
        onClick={() => setLayout("topbar")}
        title="Use the OWNA-style top bar layout"
        aria-pressed={layout === "topbar"}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors",
          layout === "topbar"
            ? "bg-white/15 text-white"
            : "text-white/60 hover:text-white",
        )}
      >
        <LayoutPanelTop className="w-3 h-3" />
        Top bar
      </button>
    </div>
  );
}
