import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollableTableProps {
  children: ReactNode;
  /** Whether to show left gradient fade (useful with sticky columns) */
  showLeftFade?: boolean;
  /** Additional classes on the outer wrapper */
  className?: string;
}

/**
 * Wraps a table in a horizontally-scrollable container with gradient fade
 * overlays on mobile to hint that more content is available off-screen.
 *
 * Usage:
 * ```tsx
 * <ScrollableTable>
 *   <table className="w-full min-w-[700px]">...</table>
 * </ScrollableTable>
 * ```
 */
export function ScrollableTable({
  children,
  showLeftFade = false,
  className,
}: ScrollableTableProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Right gradient fade — mobile only */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent z-10 sm:hidden" />
      {/* Optional left gradient fade */}
      {showLeftFade && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent z-10 sm:hidden" />
      )}
      <div className="overflow-x-auto -mx-4 sm:mx-0 scrollbar-hide">
        {children}
      </div>
    </div>
  );
}
