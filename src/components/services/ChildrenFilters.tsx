"use client";

import { X } from "lucide-react";
import type { ChildrenFilters as ChildrenFiltersType } from "@/hooks/useChildren";

interface ChildrenFiltersProps {
  filters: ChildrenFiltersType;
  onChange: (next: ChildrenFiltersType) => void;
  /**
   * Known room names, e.g. from OWNA. When empty, the Room dropdown renders
   * disabled/placeholder-only so the user sees the control but can't pick.
   */
  roomOptions?: string[];
  /**
   * Known tag values. When empty, tags filter is hidden/disabled.
   */
  tagOptions?: string[];
  /**
   * Known CCS statuses. When empty, renders a disabled dropdown with "—".
   */
  ccsStatusOptions?: string[];
}

const STATUS_OPTIONS: Array<{ value: "current" | "all" | "withdrawn"; label: string }> = [
  { value: "current", label: "Current" },
  { value: "all", label: "All" },
  { value: "withdrawn", label: "Withdrawn" },
];

const DAY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

const SORT_OPTIONS: Array<{ value: "surname" | "firstName" | "addedAt" | "dob"; label: string }> = [
  { value: "surname", label: "Surname" },
  { value: "firstName", label: "First name" },
  { value: "addedAt", label: "Date added" },
  { value: "dob", label: "Date of birth" },
];

export function ChildrenFilters({
  filters,
  onChange,
  roomOptions = [],
  tagOptions = [],
  ccsStatusOptions = [],
}: ChildrenFiltersProps) {
  const hasActiveFilters =
    !!filters.room ||
    !!filters.day ||
    !!filters.ccsStatus ||
    (filters.tags && filters.tags.length > 0) ||
    !!filters.sortBy ||
    (filters.status && filters.status !== "current");

  function patch(next: Partial<ChildrenFiltersType>) {
    onChange({ ...filters, ...next });
  }

  function clear() {
    onChange({
      serviceId: filters.serviceId,
      includeParents: filters.includeParents,
      status: "current",
    });
  }

  const activeStatus = filters.status ?? "current";

  return (
    <div className="flex flex-col gap-3">
      {/* Status segmented control */}
      <div
        className="flex flex-wrap gap-2 items-center"
        role="toolbar"
        aria-label="Children filters"
      >
        <div
          className="flex rounded-lg border border-border overflow-hidden"
          role="radiogroup"
          aria-label="Status filter"
        >
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={activeStatus === s.value}
              onClick={() => patch({ status: s.value })}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                activeStatus === s.value
                  ? "bg-brand text-white"
                  : "bg-card text-muted hover:bg-surface"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Room dropdown */}
        <label className="flex items-center gap-1 text-xs">
          <span className="sr-only">Room</span>
          <select
            aria-label="Room filter"
            value={filters.room ?? ""}
            onChange={(e) => patch({ room: e.target.value || undefined })}
            disabled={roomOptions.length === 0}
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-card text-foreground disabled:opacity-50"
          >
            <option value="">
              {roomOptions.length === 0 ? "Room (no values yet)" : "All rooms"}
            </option>
            {roomOptions.map((room) => (
              <option key={room} value={room}>
                {room}
              </option>
            ))}
          </select>
        </label>

        {/* Day dropdown */}
        <label className="flex items-center gap-1 text-xs">
          <span className="sr-only">Day</span>
          <select
            aria-label="Day filter"
            value={filters.day ?? ""}
            onChange={(e) => patch({ day: e.target.value || undefined })}
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-card text-foreground"
          >
            <option value="">All days</option>
            {DAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        {/* CCS status dropdown */}
        <label className="flex items-center gap-1 text-xs">
          <span className="sr-only">CCS status</span>
          <select
            aria-label="CCS status filter"
            value={filters.ccsStatus ?? ""}
            onChange={(e) => patch({ ccsStatus: e.target.value || undefined })}
            disabled={ccsStatusOptions.length === 0}
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-card text-foreground disabled:opacity-50"
          >
            <option value="">
              {ccsStatusOptions.length === 0 ? "CCS status (no values yet)" : "All CCS statuses"}
            </option>
            {ccsStatusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {/* Tags multi-select (placeholder when none available) */}
        <label className="flex items-center gap-1 text-xs">
          <span className="sr-only">Tags</span>
          <select
            aria-label="Tags filter"
            multiple={tagOptions.length > 0}
            value={filters.tags ?? []}
            onChange={(e) =>
              patch({
                tags: Array.from(e.target.selectedOptions).map((o) => o.value),
              })
            }
            disabled={tagOptions.length === 0}
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-card text-foreground disabled:opacity-50"
          >
            {tagOptions.length === 0 ? (
              <option value="">Tags (no values yet)</option>
            ) : (
              tagOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))
            )}
          </select>
        </label>

        {/* Sort-by dropdown */}
        <label className="flex items-center gap-1 text-xs">
          <span className="sr-only">Sort by</span>
          <select
            aria-label="Sort by"
            value={filters.sortBy ?? ""}
            onChange={(e) =>
              patch({
                sortBy: (e.target.value || undefined) as ChildrenFiltersType["sortBy"],
              })
            }
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-card text-foreground"
          >
            <option value="">Sort: default</option>
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted hover:text-foreground border border-border rounded-md bg-card hover:bg-surface transition-colors"
            aria-label="Clear filters"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
