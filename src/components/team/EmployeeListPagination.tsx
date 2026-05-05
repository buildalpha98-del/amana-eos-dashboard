"use client";

/**
 * EmployeeListPagination — server-side pagination controls for the
 * Teams tab. Numbered pages on desktop, simpler prev/next on mobile.
 *
 * 2026-05-04: introduced for the Teams tab redesign (spec PR #77).
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmployeeListPaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

const MAX_VISIBLE_PAGES = 5;

function pageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

export function EmployeeListPagination({
  page,
  totalPages,
  pageSize,
  total,
  onChange,
}: EmployeeListPaginationProps) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const numbers = pageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-between text-sm text-muted py-3">
      <span>
        Showing <strong className="text-foreground">{start}</strong>–
        <strong className="text-foreground">{end}</strong> of{" "}
        <strong className="text-foreground">{total}</strong>
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="p-1 rounded hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {numbers.map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-muted">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                "min-w-[2rem] h-8 px-2 rounded text-sm",
                n === page
                  ? "bg-brand text-white font-semibold"
                  : "hover:bg-surface text-foreground/80",
              )}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1 rounded hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
