"use client";

/**
 * RowActionMenu — kebab menu for an /team row. Built inline (no
 * radix dropdown primitive in the repo) following the same dropdown
 * pattern as `EmployeeFilters`. Closes on outside click + Escape.
 *
 * Items are filtered by viewer role before render so an admin's row
 * only shows actions they're allowed to invoke. Disabled items
 * render but can't be clicked — used for the self-protection cases
 * (e.g. "can't deactivate yourself").
 *
 * 2026-05-06: introduced (Bucket B of team UX refresh).
 */

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RowActionItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: React.ReactNode;
}

export interface RowActionMenuProps {
  items: RowActionItem[];
  /** Optional label for the trigger button (screen readers). */
  triggerLabel?: string;
}

export function RowActionMenu({
  items,
  triggerLabel = "Actions",
}: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded p-1 text-muted hover:bg-surface hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        data-testid="row-action-trigger"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-lg border border-border bg-card shadow-lg p-1"
          data-testid="row-action-menu"
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              data-action={it.key}
              onClick={(e) => {
                e.stopPropagation();
                if (it.disabled) return;
                setOpen(false);
                it.onSelect();
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left rounded",
                "hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed",
                it.destructive ? "text-red-700 hover:bg-red-50" : "text-foreground",
              )}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
