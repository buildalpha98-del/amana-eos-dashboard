"use client";

import { useState, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { MERGE_TAGS, type MergeTagDef } from "@/lib/contract-templates/merge-tag-catalog";
import { toCustomTagKey } from "@/lib/contract-templates/custom-tag-key";
import type { ManualField } from "@/lib/contract-templates/manual-fields-schema";
import {
  useContractCustomTags,
  useCreateContractCustomTag,
  useDeleteContractCustomTag,
  type ContractCustomTag,
} from "@/hooks/useContractCustomTags";

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
  const customTagsQuery = useContractCustomTags();
  const customTags: ContractCustomTag[] = useMemo(
    () => customTagsQuery.data ?? [],
    [customTagsQuery.data],
  );

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

  const filteredCustom = useMemo(
    () =>
      customTags.filter(
        (t) =>
          t.label.toLowerCase().includes(search.toLowerCase()) ||
          t.key.toLowerCase().includes(search.toLowerCase()),
      ),
    [customTags, search],
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
          <p className="text-xs font-semibold text-muted uppercase mb-1.5 tracking-wide">
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
                  <span className="text-red-500 text-2xs shrink-0">*</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
      {filteredManual.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase mb-1.5 tracking-wide">
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
                  <span className="text-red-500 text-2xs shrink-0">*</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Custom (user-defined) tags — sits below System per spec. */}
      <CustomTagsSection
        tags={filteredCustom}
        loading={customTagsQuery.isLoading}
        onInsert={onInsert}
        hasSearch={search.length > 0}
        totalCount={customTags.length}
      />
      <p className="text-2xs text-muted">
        <span className="text-red-500">*</span> required / blocking
      </p>
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Custom Tags section
// ──────────────────────────────────────────────────────────────────────────────

function CustomTagsSection({
  tags,
  loading,
  onInsert,
  hasSearch,
  totalCount,
}: {
  tags: ContractCustomTag[];
  loading: boolean;
  onInsert: (key: string) => void;
  hasSearch: boolean;
  totalCount: number;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const create = useCreateContractCustomTag();
  const del = useDeleteContractCustomTag();

  // Preview the slugified key so the user understands what
  // `{{custom.X}}` will end up looking like in the document.
  const previewKey = useMemo(() => toCustomTagKey(draft), [draft]);
  const canSave = previewKey.length > 0 && !create.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    create.mutate(
      { label: draft.trim() },
      {
        onSuccess: () => {
          setDraft("");
          setAdding(false);
        },
      },
    );
  }

  function handleCancel() {
    setAdding(false);
    setDraft("");
  }

  return (
    <div data-testid="custom-tags-section">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">
          Custom Tags
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 text-2xs font-medium text-brand hover:text-brand/80 transition-colors"
            data-testid="custom-tags-add"
          >
            <Plus className="w-3 h-3" />
            Add tag
          </button>
        )}
      </div>

      {/* Inline add form */}
      {adding && (
        <form onSubmit={handleSubmit} className="mb-2 space-y-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Project Code"
            autoFocus
            maxLength={60}
            className="w-full px-2 py-1 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-brand"
            data-testid="custom-tags-input"
          />
          {draft && (
            <p className="text-2xs text-muted font-mono">
              → {previewKey
                ? `{{${previewKey}}}`
                : "(needs at least one letter or number)"}
            </p>
          )}
          <div className="flex gap-1">
            <button
              type="submit"
              disabled={!canSave}
              className="flex-1 px-2 py-1 text-[11px] font-medium bg-brand text-white rounded hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="custom-tags-save"
            >
              {create.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-2 py-1 text-[11px] text-muted rounded hover:bg-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="space-y-0.5">
        {tags.map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-1 rounded hover:bg-surface"
            data-testid="custom-tag-row"
          >
            <button
              type="button"
              onClick={() => onInsert(t.key)}
              className="flex-1 text-left text-xs px-2 py-1 truncate hover:text-brand transition-colors"
              title={`Insert {{${t.key}}}`}
            >
              {t.label}
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `Remove "${t.label}" from the Custom Tags list? Tags already inserted in any template will keep working.`,
                  )
                ) {
                  del.mutate({ id: t.id });
                }
              }}
              disabled={del.isPending}
              aria-label={`Delete ${t.label}`}
              className="p-1 rounded text-muted hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              data-testid="custom-tag-delete"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {!loading && tags.length === 0 && !adding && (
          <p className="text-[11px] text-muted italic px-2 py-1">
            {hasSearch && totalCount > 0
              ? "No custom tags match your search."
              : "No custom tags yet. Add your own with + Add tag."}
          </p>
        )}
      </div>
    </div>
  );
}
