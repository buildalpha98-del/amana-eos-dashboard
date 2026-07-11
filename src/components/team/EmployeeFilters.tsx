"use client";

/**
 * EmployeeFilters — search input + Status / Service / Role multi-select
 * filters for the new Teams tab list. Controlled component: parent owns
 * filter state (URL-encoded) and re-renders on change.
 *
 * Search input debounces ~300ms before propagating to onChange — keeps
 * the URL from thrashing per keystroke.
 *
 * 2026-05-04: introduced for the Teams tab redesign (spec PR #77).
 */

import { useEffect, useRef, useState } from "react";
import { Search, X, Filter as FilterIcon, Check } from "lucide-react";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";
import { cn } from "@/lib/utils";
import { ROLES } from "@/lib/role-enum";
import { useEmployeeTags } from "@/hooks/useEmployeeTags";
import type { Role } from "@prisma/client";

export interface EmployeeFiltersValue {
  q: string;
  status: "active" | "pending" | "deactivated" | null;
  serviceIds: string[];
  roles: string[];
  tags: string[];
}

export interface EmployeeFiltersProps {
  value: EmployeeFiltersValue;
  onChange: (next: EmployeeFiltersValue) => void;
  services: Array<{ id: string; name: string }>;
  /** Used to hide the "deactivated" status option from non-admin viewers. */
  viewerRole: string;
}

const SEARCH_DEBOUNCE_MS = 300;

export function EmployeeFilters({
  value,
  onChange,
  services,
  viewerRole,
}: EmployeeFiltersProps) {
  // Local state for the search input — propagates to parent after debounce.
  const [localQ, setLocalQ] = useState(value.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local from parent when parent forces (e.g. via "Clear all").
  useEffect(() => {
    setLocalQ(value.q);
  }, [value.q]);

  function emit(next: Partial<EmployeeFiltersValue>) {
    onChange({ ...value, ...next });
  }

  function onSearchChange(next: string) {
    setLocalQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      emit({ q: next });
    }, SEARCH_DEBOUNCE_MS);
  }

  const isAdminTier =
    viewerRole === "owner" ||
    viewerRole === "head_office" ||
    viewerRole === "admin";

  const STATUS_OPTIONS: Array<{
    value: EmployeeFiltersValue["status"];
    label: string;
  }> = [
    { value: "active", label: "Active" },
    { value: "pending", label: "Pending" },
    ...(isAdminTier
      ? [{ value: "deactivated" as const, label: "Deactivated" }]
      : []),
  ];

  const hasAnyFilter =
    !!value.q ||
    !!value.status ||
    value.serviceIds.length > 0 ||
    value.roles.length > 0 ||
    value.tags.length > 0;

  // Distinct tags org-wide, scoped to the viewer; cached 5 min.
  // Skip the fetch entirely when there are no tags in the system —
  // empty response is fine, no chip renders.
  const tagsQuery = useEmployeeTags();
  const knownTags = tagsQuery.data?.tags ?? [];

  function clearAll() {
    onChange({ q: "", status: null, serviceIds: [], roles: [], tags: [] });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="search"
            value={localQ}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name or email…"
            aria-label="Search employees"
            className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Status */}
        <FilterMenu
          label="Status"
          icon={<FilterIcon className="h-4 w-4" />}
          options={STATUS_OPTIONS.map((o) => ({
            id: o.value ?? "",
            label: o.label,
          }))}
          selected={value.status ? [value.status] : []}
          onChange={(ids) =>
            emit({
              status: (ids[0] ?? null) as EmployeeFiltersValue["status"],
            })
          }
          singleSelect
        />

        {/* Service */}
        <FilterMenu
          label="Service"
          icon={<FilterIcon className="h-4 w-4" />}
          options={services.map((s) => ({ id: s.id, label: s.name }))}
          selected={value.serviceIds}
          onChange={(ids) => emit({ serviceIds: ids })}
        />

        {/* Role */}
        <FilterMenu
          label="Role"
          icon={<FilterIcon className="h-4 w-4" />}
          options={ROLES.map((r) => ({
            id: r,
            label: ROLE_DISPLAY_NAMES[r as Role] ?? r,
          }))}
          selected={value.roles}
          onChange={(ids) => emit({ roles: ids })}
        />

        {/* Tag — hidden when the org has no tags yet so the chip
            doesn't render an empty dropdown. */}
        {knownTags.length > 0 ? (
          <FilterMenu
            label="Tag"
            icon={<FilterIcon className="h-4 w-4" />}
            options={knownTags.map((t) => ({ id: t, label: t }))}
            selected={value.tags}
            onChange={(ids) => emit({ tags: ids })}
          />
        ) : null}
      </div>

      {/* Active-filters strip */}
      {hasAnyFilter ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          data-testid="active-filters-strip"
        >
          {value.q ? (
            <FilterChip
              label={`"${value.q}"`}
              onClear={() => {
                setLocalQ("");
                emit({ q: "" });
              }}
            />
          ) : null}
          {value.status ? (
            <FilterChip
              label={
                STATUS_OPTIONS.find((o) => o.value === value.status)?.label ??
                value.status
              }
              onClear={() => emit({ status: null })}
            />
          ) : null}
          {value.serviceIds.map((id) => {
            const svc = services.find((s) => s.id === id);
            return (
              <FilterChip
                key={`svc-${id}`}
                label={svc?.name ?? id}
                onClear={() =>
                  emit({
                    serviceIds: value.serviceIds.filter((x) => x !== id),
                  })
                }
              />
            );
          })}
          {value.roles.map((r) => (
            <FilterChip
              key={`role-${r}`}
              label={ROLE_DISPLAY_NAMES[r as Role] ?? r}
              onClear={() =>
                emit({ roles: value.roles.filter((x) => x !== r) })
              }
            />
          ))}
          {value.tags.map((t) => (
            <FilterChip
              key={`tag-${t}`}
              label={`Tag: ${t}`}
              onClear={() =>
                emit({ tags: value.tags.filter((x) => x !== t) })
              }
            />
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-brand hover:underline ml-2"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ── FilterMenu ───────────────────────────────────────────────────────

interface FilterMenuOption {
  id: string;
  label: string;
}

interface FilterMenuProps {
  label: string;
  icon?: React.ReactNode;
  options: FilterMenuOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  singleSelect?: boolean;
}

function FilterMenu({
  label,
  icon,
  options,
  selected,
  onChange,
  singleSelect,
}: FilterMenuProps) {
  const [open, setOpen] = useState(false);

  function toggle(id: string) {
    if (singleSelect) {
      onChange(selected.includes(id) ? [] : [id]);
      setOpen(false);
      return;
    }
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-surface",
          selected.length > 0 && "border-brand/40 bg-brand/5",
        )}
        aria-expanded={open}
        aria-label={`${label} filter${selected.length ? ` (${selected.length} selected)` : ""}`}
      >
        {icon}
        <span>{label}</span>
        {selected.length > 0 ? (
          <span className="rounded-full bg-brand text-white text-2xs font-bold px-1.5 py-0">
            {selected.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="absolute top-full mt-2 left-0 z-20 min-w-[180px] max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg p-1"
          role="menu"
        >
          {options.length === 0 ? (
            <p className="text-xs text-muted px-3 py-2">No options</p>
          ) : (
            options.map((o) => {
              const checked = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm rounded hover:bg-surface flex items-center gap-2",
                  )}
                  role="menuitem"
                >
                  <span
                    className={cn(
                      "inline-flex h-4 w-4 items-center justify-center rounded border",
                      checked
                        ? "bg-brand border-brand text-white"
                        : "border-border",
                    )}
                  >
                    {checked ? <Check className="h-3 w-3" /> : null}
                  </span>
                  {o.label}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── FilterChip ───────────────────────────────────────────────────────

function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="text-muted hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
