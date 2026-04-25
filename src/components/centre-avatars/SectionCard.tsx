"use client";

import { useState } from "react";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { toast } from "@/hooks/useToast";

/**
 * Generic section editor for the 4 JSON sections of a Centre Avatar
 * (snapshot, parentAvatar, programmeMix, assetLibrary).
 *
 * v1 UX: readonly JSON-ish view by default, "Edit" flips to a JSON textarea
 * you can save. The shape is enforced server-side against the section's Zod
 * schema — any invalid JSON or shape mismatch surfaces as a toast.
 */
export function SectionCard({
  title,
  description,
  content,
  onSave,
  isSaving,
  extraHeader,
  children,
}: {
  title: string;
  description?: string;
  content: unknown;
  onSave: (next: Record<string, unknown>) => Promise<void> | void;
  isSaving: boolean;
  extraHeader?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(() => JSON.stringify(content ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(JSON.stringify(content ?? {}, null, 2));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = draft.trim() === "" ? {} : JSON.parse(draft);
    } catch {
      setError("Invalid JSON — check the syntax.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setError("Top-level value must be an object.");
      return;
    }
    try {
      await onSave(parsed as Record<string, unknown>);
      setEditing(false);
      toast({ description: `${title} saved.` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {extraHeader}
          {editing ? (
            <>
              <button
                type="button"
                onClick={cancel}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={isSaving}
                className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter or Cmd/Ctrl+S → save; Esc → cancel
                if ((e.metaKey || e.ctrlKey) && (e.key === "Enter" || e.key === "s")) {
                  e.preventDefault();
                  void save();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                }
              }}
              spellCheck={false}
              rows={18}
              autoFocus
              aria-label={`${title} JSON editor`}
              className="w-full rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs font-mono focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-[11px] text-muted">
              <kbd className="rounded bg-surface px-1 py-0.5 font-mono">⌘</kbd>
              <kbd className="ml-0.5 rounded bg-surface px-1 py-0.5 font-mono">↵</kbd> save ·
              <kbd className="ml-1.5 rounded bg-surface px-1 py-0.5 font-mono">Esc</kbd> cancel
            </p>
            {error && (
              <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}
          </>
        ) : (
          children ?? <JsonReadonly value={content} />
        )}
      </div>
    </section>
  );
}

export function JsonReadonly({ value }: { value: unknown }) {
  const s = JSON.stringify(value ?? {}, null, 2);
  if (s === "{}") {
    return (
      <p className="text-xs italic text-muted">
        Empty — click Edit to start filling this section in.
      </p>
    );
  }
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-surface/40 p-3 text-xs leading-relaxed text-foreground/80">
      {s}
    </pre>
  );
}
