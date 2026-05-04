"use client";

import { useState, useMemo } from "react";
import { MERGE_TAGS, type MergeTagDef } from "@/lib/contract-templates/merge-tag-catalog";
import type { ManualField } from "@/lib/contract-templates/manual-fields-schema";

const GROUP_LABELS: Record<string, string> = {
  staff: "Staff",
  service: "Service",
  contract: "Contract",
  manager: "Manager",
  system: "System",
};

export function MergeTagPanel({
  manualFields,
  onInsert,
}: {
  manualFields: ManualField[];
  onInsert: (key: string) => void;
}) {
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const filtered = MERGE_TAGS.filter(
      (t) =>
        t.label.toLowerCase().includes(search.toLowerCase()) ||
        t.key.toLowerCase().includes(search.toLowerCase())
    );
    const grouped: Record<string, MergeTagDef[]> = {};
    for (const tag of filtered) {
      if (!grouped[tag.group]) grouped[tag.group] = [];
      grouped[tag.group].push(tag);
    }
    return grouped;
  }, [search]);

  const filteredManual = useMemo(
    () =>
      manualFields.filter(
        (f) =>
          f.label.toLowerCase().includes(search.toLowerCase()) ||
          f.key.toLowerCase().includes(search.toLowerCase())
      ),
    [manualFields, search]
  );

  return (
    <aside className="border-l border-border bg-card p-4 space-y-4 overflow-y-auto h-full">
      <h3 className="text-sm font-semibold">Merge tags</h3>
      <input
        type="text"
        placeholder="Search tags..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
      />
      {Object.entries(groups).map(([group, tags]) => (
        <div key={group}>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 tracking-wide">
            {GROUP_LABELS[group] ?? group}
          </p>
          <div className="space-y-0.5">
            {tags.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onInsert(t.key)}
                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-surface flex items-center justify-between gap-2 group"
              >
                <span className="truncate group-hover:text-brand transition-colors">
                  {t.label}
                </span>
                {t.blocking && (
                  <span className="text-red-500 text-[10px] shrink-0">*</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
      {filteredManual.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 tracking-wide">
            Manual
          </p>
          <div className="space-y-0.5">
            {filteredManual.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => onInsert(f.key)}
                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-surface flex items-center justify-between gap-2 group"
              >
                <span className="truncate group-hover:text-brand transition-colors">
                  {f.label}
                </span>
                {f.required && (
                  <span className="text-red-500 text-[10px] shrink-0">*</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        <span className="text-red-500">*</span> required / blocking
      </p>
    </aside>
  );
}
