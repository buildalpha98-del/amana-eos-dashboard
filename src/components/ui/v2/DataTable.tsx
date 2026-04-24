"use client";

/**
 * DataTable — dense, virtualized, keyboard-navigable table for staff surfaces.
 *
 * Used on Scorecard, Timesheets, Team, Services index, Roll Call. Scales to
 * 500+ rows via @tanstack/react-virtual (windowed rendering).
 *
 * Keyboard:
 *   j/k        — row down/up
 *   ↓/↑        — same (standard)
 *   Enter      — onRowAction (default: noop; overridable)
 *   Space      — toggle selection (when selectable)
 *   Shift+Space — range select (selectable + last-anchor present)
 *   Home/End    — first/last row
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export interface ColumnDef<TRow> {
  key: string;
  header: ReactNode;
  /** Cell renderer — receives the row + its index. */
  cell: (row: TRow, index: number) => ReactNode;
  /** Fixed pixel width (e.g. 120) or "auto" for flex. */
  width?: number | "auto";
  /** Enable per-column sort. Defaults to false. */
  sortable?: boolean;
  /** Freeze column to the left of the scroll area (only first column supported for MVP). */
  sticky?: boolean;
  /** Align text in cell. */
  align?: "left" | "center" | "right";
  /** Class for the cell (not the header). */
  className?: string;
}

export interface DataTableProps<TRow> {
  rows: TRow[];
  columns: ColumnDef<TRow>[];
  getRowId: (row: TRow) => string;
  /** Invoked when the user presses Enter on a row, or clicks it. */
  onRowAction?: (row: TRow) => void;
  /** Enable row selection via Space / click on checkbox column. */
  selectable?: boolean;
  /** Controlled selection set. Leave unset for uncontrolled. */
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Empty state when rows.length === 0. */
  emptyState?: ReactNode;
  /** Loading skeleton when isLoading. */
  isLoading?: boolean;
  /** Row height — defaults to var(--row-height-dense). */
  rowHeight?: number;
  /** Max height of the scroll viewport. Defaults to 60vh. */
  maxHeight?: string;
  /** Additional class on the outer table wrapper. */
  className?: string;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<TRow>({
  rows,
  columns,
  getRowId,
  onRowAction,
  selectable = false,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  emptyState,
  isLoading = false,
  rowHeight = 36,
  maxHeight = "60vh",
  className,
}: DataTableProps<TRow>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeRow, setActiveRow] = useState(0);
  const [sort, setSort] = useState<SortState>(null);
  const [uncontrolledSelected, setUncontrolledSelected] = useState<Set<string>>(
    new Set(),
  );
  const selectedIds = controlledSelectedIds ?? uncontrolledSelected;
  const setSelectedIds = (ids: Set<string>) => {
    if (onSelectionChange) onSelectionChange(ids);
    if (!controlledSelectedIds) setUncontrolledSelected(ids);
  };
  const anchorRef = useRef<string | null>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortable) return rows;
    return [...rows].sort((a, b) => {
      const av = extractSortKey(col.cell(a, 0));
      const bv = extractSortKey(col.cell(b, 0));
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  const toggleSort = useCallback(
    (key: string) => {
      setSort((prev) => {
        if (prev?.key !== key) return { key, dir: "asc" };
        if (prev.dir === "asc") return { key, dir: "desc" };
        return null;
      });
    },
    [],
  );

  const toggleSelect = useCallback(
    (id: string, options?: { range?: boolean }) => {
      const next = new Set(selectedIds);
      if (options?.range && anchorRef.current) {
        const ids = sortedRows.map(getRowId);
        const anchorIdx = ids.indexOf(anchorRef.current);
        const targetIdx = ids.indexOf(id);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const [lo, hi] = [anchorIdx, targetIdx].sort((a, b) => a - b);
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
        } else {
          next.has(id) ? next.delete(id) : next.add(id);
        }
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
        anchorRef.current = id;
      }
      setSelectedIds(next);
    },
    [selectedIds, sortedRows, getRowId],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (sortedRows.length === 0) return;
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setActiveRow((i) => Math.min(sortedRows.length - 1, i + 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setActiveRow((i) => Math.max(0, i - 1));
          break;
        case "Home":
          e.preventDefault();
          setActiveRow(0);
          break;
        case "End":
          e.preventDefault();
          setActiveRow(sortedRows.length - 1);
          break;
        case "Enter":
          e.preventDefault();
          onRowAction?.(sortedRows[activeRow]);
          break;
        case " ":
          if (selectable) {
            e.preventDefault();
            const id = getRowId(sortedRows[activeRow]);
            toggleSelect(id, { range: e.shiftKey });
          }
          break;
      }
    },
    [sortedRows, activeRow, onRowAction, selectable, getRowId, toggleSelect],
  );

  useEffect(() => {
    virtualizer.scrollToIndex(activeRow, { behavior: "smooth" });
  }, [activeRow, virtualizer]);

  if (isLoading) {
    return (
      <div className={cn("warm-card animate-pulse", className)} aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-[36px] border-b border-[color:var(--color-border)] last:border-0"
          />
        ))}
      </div>
    );
  }

  if (sortedRows.length === 0) {
    return (
      <div
        className={cn(
          "warm-card flex items-center justify-center text-center py-10 text-sm text-[color:var(--color-muted)]",
          className,
        )}
      >
        {emptyState ?? "No data."}
      </div>
    );
  }

  const gridTemplate = columns
    .map((c) => (c.width === "auto" || c.width === undefined ? "1fr" : `${c.width}px`))
    .join(" ");

  return (
    <div
      className={cn(
        "warm-card !p-0 overflow-hidden border-[color:var(--color-border)]",
        className,
      )}
      role="table"
    >
      {/* Header */}
      <div
        role="row"
        className="grid items-center bg-[color:var(--color-cream-deep)] border-b border-[color:var(--color-border)] text-[11px] font-heading font-semibold uppercase tracking-[0.06em] text-[color:var(--color-muted)]"
        style={{ gridTemplateColumns: selectable ? `40px ${gridTemplate}` : gridTemplate }}
      >
        {selectable && (
          <div
            role="columnheader"
            className="h-[36px] px-3 flex items-center justify-center sticky left-0 bg-[color:var(--color-cream-deep)] z-10"
          />
        )}
        {columns.map((c, i) => {
          const sticky = c.sticky && i === 0 && !selectable;
          return (
            <div
              key={c.key}
              role="columnheader"
              className={cn(
                "h-[36px] px-3 flex items-center gap-1 select-none",
                c.align === "center" && "justify-center",
                c.align === "right" && "justify-end",
                sticky && "sticky left-0 bg-[color:var(--color-cream-deep)] z-10",
                c.sortable && "cursor-pointer hover:text-[color:var(--color-foreground)]",
              )}
              onClick={() => c.sortable && toggleSort(c.key)}
              aria-sort={
                sort?.key === c.key
                  ? sort.dir === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
            >
              {c.header}
              {c.sortable && sort?.key === c.key && (
                <span aria-hidden>{sort.dir === "asc" ? "▲" : "▼"}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Body (virtualized) */}
      <div
        ref={scrollRef}
        tabIndex={0}
        className="overflow-auto focus:outline-none"
        style={{ maxHeight }}
        onKeyDown={onKeyDown}
        role="rowgroup"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((vRow) => {
            const row = sortedRows[vRow.index];
            const id = getRowId(row);
            const isSelected = selectedIds.has(id);
            const isActive = vRow.index === activeRow;
            return (
              <div
                key={id}
                role="row"
                aria-selected={isSelected}
                data-active={isActive ? "true" : undefined}
                className={cn(
                  "absolute left-0 right-0 grid items-center text-[13px] border-b border-[color:var(--color-border)]",
                  "hover:bg-[color:var(--color-brand-soft)] transition-colors",
                  isActive && "bg-[color:var(--color-brand-soft)]",
                  isSelected && "bg-[color:var(--color-brand-soft)]/60",
                )}
                style={{
                  height: `${rowHeight}px`,
                  transform: `translateY(${vRow.start}px)`,
                  gridTemplateColumns: selectable
                    ? `40px ${gridTemplate}`
                    : gridTemplate,
                }}
                onClick={() => {
                  setActiveRow(vRow.index);
                  onRowAction?.(row);
                }}
              >
                {selectable && (
                  <div className="h-full px-3 flex items-center justify-center sticky left-0 bg-inherit">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(id, { range: (e.nativeEvent as MouseEvent).shiftKey });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select row ${id}`}
                    />
                  </div>
                )}
                {columns.map((c, i) => {
                  const sticky = c.sticky && i === 0 && !selectable;
                  return (
                    <div
                      key={c.key}
                      role="cell"
                      className={cn(
                        "h-full px-3 flex items-center min-w-0 truncate",
                        c.align === "center" && "justify-center",
                        c.align === "right" && "justify-end",
                        sticky &&
                          "sticky left-0 bg-inherit z-10 border-r border-[color:var(--color-border)]",
                        c.className,
                      )}
                    >
                      {c.cell(row, vRow.index)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function extractSortKey(value: unknown): string | number {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return value;
  // For ReactNodes, try to get a string — best-effort for simple nodes.
  const str = String(value);
  return str;
}
