"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Search } from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { cn } from "@/lib/utils";

interface ServiceMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}

export function ServiceMultiSelect({
  selectedIds,
  onChange,
  label,
}: ServiceMultiSelectProps) {
  const { data: services, isLoading } = useServices("active");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const sorted = [...(services ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const filtered = sorted.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  );

  const selectedServices = sorted.filter((s) => selectedIds.includes(s.id));

  function toggleId(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function selectAll() {
    onChange(sorted.map((s) => s.id));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-left flex items-center justify-between gap-2",
          "focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        )}
      >
        <div className="flex flex-wrap gap-1 min-h-[20px] flex-1">
          {selectedServices.length === 0 ? (
            <span className="text-gray-500 italic">All Centres</span>
          ) : (
            selectedServices.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
              >
                {s.code}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleId(s.id);
                  }}
                  className="hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedIds.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
              {selectedIds.length}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-gray-400 transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {/* Search */}
          <div className="relative border-b border-gray-100 p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search centres..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Select All / Clear */}
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-brand hover:underline"
            >
              Select All
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-gray-500 hover:underline"
            >
              Clear
            </button>
          </div>

          {/* Checkbox List */}
          <div className="max-h-52 overflow-y-auto p-1">
            {isLoading ? (
              <p className="px-3 py-4 text-center text-sm text-gray-500">
                Loading...
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-500">
                No centres found
              </p>
            ) : (
              filtered.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleId(s.id)}
                    className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-gray-700">
                    {s.name}{" "}
                    <span className="text-gray-400">({s.code})</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
