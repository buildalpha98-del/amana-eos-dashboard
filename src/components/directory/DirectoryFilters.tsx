"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";

export interface ServiceOption {
  id: string;
  name: string;
}

export interface DirectoryFiltersValue {
  q: string;
  service: string;
  role: string;
}

export interface DirectoryFiltersProps {
  value: DirectoryFiltersValue;
  onChange: (value: DirectoryFiltersValue) => void;
  services: ServiceOption[];
  /** Show the role dropdown (admin only) */
  showRoleFilter: boolean;
  /** Search debounce in ms (default 250) */
  debounceMs?: number;
}

const ROLE_OPTIONS = Object.entries(ROLE_DISPLAY_NAMES).map(([value, label]) => ({
  value,
  label,
}));

export function DirectoryFilters({
  value,
  onChange,
  services,
  showRoleFilter,
  debounceMs = 250,
}: DirectoryFiltersProps) {
  // Local input state for debouncing the search field only.
  // Dropdowns fire onChange immediately.
  const [searchInput, setSearchInput] = useState(value.q);

  // Keep the local input in sync if parent clears filters externally.
  useEffect(() => {
    setSearchInput(value.q);
  }, [value.q]);

  // Debounced propagation of search input → parent state.
  useEffect(() => {
    if (searchInput === value.q) return;
    const handle = setTimeout(() => {
      onChange({ ...value, q: searchInput });
    }, debounceMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, debounceMs]);

  const hasFilters = !!(value.q || value.service || (showRoleFilter && value.role));

  function clearAll() {
    setSearchInput("");
    onChange({ q: "", service: "", role: "" });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name..."
          aria-label="Search staff by name"
          className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
      </div>

      {/* Service filter */}
      <select
        value={value.service}
        onChange={(e) => onChange({ ...value, service: e.target.value })}
        aria-label="Filter by service"
        className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
      >
        <option value="">All Services</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {/* Role filter — admin only */}
      {showRoleFilter && (
        <select
          value={value.role}
          onChange={(e) =>
            onChange({ ...value, role: e.target.value as Role | "" })
          }
          aria-label="Filter by role"
          className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        >
          <option value="">All Roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      )}

      {/* Clear */}
      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-muted hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
          Clear
        </button>
      )}
    </div>
  );
}
