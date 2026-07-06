"use client";

/**
 * DensityToggle — comfortable/compact switch in the top bar
 * (2026-07-06 design system). Hidden on small screens: phones always
 * get comfortable 44px touch rows.
 */

import { Rows3, Rows4 } from "lucide-react";
import { useDensity } from "@/hooks/useDensity";

export function DensityToggle() {
  const { density, toggle } = useDensity();
  const compact = density === "compact";
  return (
    <button
      onClick={toggle}
      aria-label={compact ? "Switch to comfortable density" : "Switch to compact density"}
      title={compact ? "Comfortable rows" : "Compact rows"}
      className="hidden md:inline-flex p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors"
    >
      {compact ? <Rows4 className="w-4 h-4" /> : <Rows3 className="w-4 h-4" />}
    </button>
  );
}
