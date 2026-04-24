"use client";

/**
 * FilterBar — dense filter strip for list/index pages.
 *
 * Consolidates search + dropdown filters + active-filter chips into a single
 * horizontal strip. Designed to sit directly above a DataTable.
 *
 * Pattern:
 *   const [filters, setFilters] = useState({ status: "all", serviceId: "all" });
 *   <FilterBar
 *     search={{ value: q, onChange: setQ, placeholder: "Search todos…" }}
 *     filters={[
 *       { key: "status", label: "Status", options: [...] },
 *       { key: "serviceId", label: "Service", options: services },
 *     ]}
 *     values={filters}
 *     onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
 *     onReset={() => setFilters({ status: "all", serviceId: "all" })}
 *   />
 */

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

export interface FilterDef {
  key: string;
  label: string;
  options: readonly FilterOption[];
  /** Optional "all / none" sentinel value. Defaults to "all". */
  allValue?: string;
}

export interface FilterBarProps {
  /** Optional search input. Omit to hide. */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  /** Dropdown filter definitions. */
  filters?: readonly FilterDef[];
  /** Current value map keyed by FilterDef.key. */
  values?: Record<string, string>;
  /** Fired when any filter value changes. */
  onChange?: (key: string, value: string) => void;
  /** Optional slot for leading content (e.g. segmented tab switcher). */
  leading?: React.ReactNode;
  /** Optional slot for trailing content (e.g. "New" button, bulk actions). */
  trailing?: React.ReactNode;
  /** Show a "Clear filters" button when any filter is non-default. */
  onReset?: () => void;
  /** Custom label for the reset button. Default: "Clear". */
  resetLabel?: string;
  className?: string;
}

export function FilterBar({
  search,
  filters,
  values,
  onChange,
  leading,
  trailing,
  onReset,
  resetLabel = "Clear",
  className,
}: FilterBarProps) {
  const activeCount = filters
    ? filters.reduce((n, f) => {
        const v = values?.[f.key] ?? f.allValue ?? "all";
        return v !== (f.allValue ?? "all") ? n + 1 : n;
      }, 0)
    : 0;
  const showReset = onReset && activeCount > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 px-3 py-2 rounded-[var(--radius-md)]",
        "bg-[color:var(--color-cream-soft)] border border-[color:var(--color-border)]",
        className,
      )}
      data-active-filters={activeCount}
    >
      {leading}

      {search && (
        <div className="relative flex-1 min-w-[180px]">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[color:var(--color-muted)] pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "Search…"}
            className={cn(
              "w-full pl-8 pr-2.5 py-1.5 text-[13px] rounded-[var(--radius-sm)]",
              "bg-[color:var(--color-cream-deep)] border border-transparent",
              "text-[color:var(--color-foreground)] placeholder-[color:var(--color-muted)]/70",
              "focus:outline-none focus:border-[color:var(--color-brand)]/40",
              "focus:bg-white transition-colors",
            )}
            aria-label={search.placeholder ?? "Search"}
          />
        </div>
      )}

      {filters?.map((f) => {
        const v = values?.[f.key] ?? f.allValue ?? "all";
        const isActive = v !== (f.allValue ?? "all");
        return (
          <label
            key={f.key}
            className="flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--color-muted)]"
          >
            <span className="shrink-0">{f.label}</span>
            <select
              value={v}
              onChange={(e) => onChange?.(f.key, e.target.value)}
              className={cn(
                "px-2 py-1 text-[13px] rounded-[var(--radius-sm)] border cursor-pointer",
                "bg-[color:var(--color-cream-deep)] text-[color:var(--color-foreground)]",
                "focus:outline-none focus:border-[color:var(--color-brand)]/40",
                isActive
                  ? "border-[color:var(--color-brand)]/40 font-semibold"
                  : "border-transparent",
              )}
              aria-label={f.label}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}

      {showReset && (
        <button
          type="button"
          onClick={onReset}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 text-[12px] rounded-[var(--radius-sm)]",
            "text-[color:var(--color-muted)] hover:text-[color:var(--color-foreground)]",
            "hover:bg-[color:var(--color-cream-deep)] transition-colors",
          )}
        >
          <X className="w-3 h-3" aria-hidden />
          {resetLabel}
          <span className="text-[10px] text-[color:var(--color-muted)]/70">
            ({activeCount})
          </span>
        </button>
      )}

      {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
    </div>
  );
}
