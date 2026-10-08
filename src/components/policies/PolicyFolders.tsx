"use client";

/**
 * Folders for the policy library (Daniel, 2026-10-09): ~100 documents in
 * one list is a scroll nobody finishes. The library opens on folders —
 * Policies, Procedures, Other documents — and a tap opens one. Searching
 * skips the folders and looks across everything, because someone typing
 * "sun safe" shouldn't first have to guess which folder it's in.
 *
 * Shared by the office list (PolicyAdminPanel) and the staff/centre list
 * (PolicyStaffPanel); each passes its own row renderer.
 */
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import type { PolicyDocumentCategory } from "@prisma/client";

export const POLICY_FOLDERS: { key: PolicyDocumentCategory; label: string; hint: string }[] = [
  { key: "policy", label: "Policies", hint: "What we do and why" },
  { key: "procedure", label: "Procedures", hint: "Step by step, how we do it" },
  { key: "other", label: "Other documents", hint: "Forms, templates and guides" },
];

export function PolicyFolderGrid<T extends { category: PolicyDocumentCategory }>({
  docs,
  onOpen,
  badge,
}: {
  docs: T[];
  onOpen: (folder: PolicyDocumentCategory) => void;
  /** Optional per-folder extra, e.g. "3 to sign". */
  badge?: (inFolder: T[]) => string | null;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {POLICY_FOLDERS.map((f) => {
        const inFolder = docs.filter((d) => d.category === f.key);
        if (inFolder.length === 0) return null;
        const extra = badge?.(inFolder);
        return (
          <li key={f.key}>
            <button
              type="button"
              onClick={() => onOpen(f.key)}
              className="flex w-full min-h-20 items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-surface focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <Folder className="h-8 w-8 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{f.label}</span>
                <span className="block text-xs text-muted">
                  {inFolder.length} {inFolder.length === 1 ? "document" : "documents"} · {f.hint}
                </span>
                {extra && (
                  <span className="mt-1 inline-block rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-2xs font-medium text-amber-800 dark:text-amber-300">
                    {extra}
                  </span>
                )}
              </span>
              <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function PolicyFolderBack({
  folder,
  count,
  onBack,
}: {
  folder: PolicyDocumentCategory;
  count: number;
  onBack: () => void;
}) {
  const label = POLICY_FOLDERS.find((f) => f.key === folder)?.label ?? folder;
  return (
    <div className="mb-3 flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-brand hover:bg-surface"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All folders
      </button>
      <span className="text-muted">/</span>
      <span className="font-semibold text-foreground">
        {label} <span className="font-normal text-muted">({count})</span>
      </span>
    </div>
  );
}
