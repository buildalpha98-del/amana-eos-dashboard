"use client";

import { useState } from "react";
import { Code2, Pencil, X } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/Sheet";
import type { SectionKey } from "@/lib/centre-avatar/sections";
import { SnapshotForm } from "./forms/SnapshotForm";
import { ParentAvatarForm } from "./forms/ParentAvatarForm";
import { ProgrammeMixForm } from "./forms/ProgrammeMixForm";
import { AssetLibraryForm } from "./forms/AssetLibraryForm";
import { SectionReadonly } from "./SectionReadonly";

/**
 * Section editor for the 4 content sections of a Centre Avatar.
 *
 * - Default mode is a structured form (per-section, schema-shaped) — the
 *   primary path for Akram and the marketing team.
 * - "Raw JSON" mode is an advanced toggle for Jayden / engineers when a
 *   shape change needs to be made by hand.
 * - Section-specific readonly summary is shown when not editing.
 */
export function SectionCard({
  sectionKey,
  title,
  description,
  content,
  onSave,
  isSaving,
  extraHeader,
  readOnly = false,
}: {
  sectionKey: SectionKey;
  title: string;
  description?: string;
  content: unknown;
  onSave: (next: Record<string, unknown>) => Promise<void> | void;
  isSaving: boolean;
  extraHeader?: React.ReactNode;
  /** When true, hide all edit affordances and only show the readonly summary. */
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"form" | "json">("form");
  const isMobile = useIsMobile();

  const startEdit = () => {
    setMode("form");
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
  };

  // Autosave saves silently without closing the editor — Akram is mid-typing.
  // Explicit Save (button click) closes the editor + toasts.
  const handleAutoSave = async (next: Record<string, unknown>) => {
    await onSave(next);
  };

  const handleExplicitSave = async (next: Record<string, unknown>) => {
    try {
      await onSave(next);
      setEditing(false);
      toast({ description: `${title} saved.` });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Save failed.",
      });
    }
  };

  // Editing on mobile happens inside a full-width sheet (see render below).
  // Editing on desktop happens inline. The card body always shows the
  // readonly summary; the inline editor only renders on desktop.
  const editorBody = mode === "form" ? (
    <SectionFormDispatch
      sectionKey={sectionKey}
      content={content}
      onAutoSave={handleAutoSave}
      onExplicitSave={handleExplicitSave}
      onCancel={cancel}
      isSaving={isSaving}
    />
  ) : (
    <RawJsonEditor
      title={title}
      content={content}
      onSave={handleExplicitSave}
      onCancel={cancel}
      isSaving={isSaving}
    />
  );

  const modeToggle = (
    <button
      type="button"
      onClick={() => setMode(mode === "form" ? "json" : "form")}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface"
      aria-pressed={mode === "json"}
      title={mode === "form" ? "Switch to raw JSON" : "Switch to form"}
    >
      <Code2 className="h-3.5 w-3.5" />
      {mode === "form" ? "Raw JSON" : "Form"}
    </button>
  );

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {extraHeader}
            {/* Desktop edit affordances */}
            {editing && !readOnly && !isMobile && (
              <>
                {modeToggle}
                <button
                  type="button"
                  onClick={cancel}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </>
            )}
            {!editing && !readOnly && (
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
          {editing && !readOnly && !isMobile ? (
            editorBody
          ) : (
            <SectionReadonly sectionKey={sectionKey} content={content} />
          )}
        </div>
      </section>

      {/* Mobile editor lives in a full-width sheet so a long form is usable
          on a phone. Sticky header carries the mode toggle + cancel. */}
      {isMobile && !readOnly && (
        <Sheet
          open={editing}
          onOpenChange={(o) => {
            if (!o) cancel();
          }}
        >
          <SheetContent
            side="right"
            width="max-w-2xl"
            className="flex flex-col"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
              <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
              <div className="flex items-center gap-2">
                {modeToggle}
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">{editorBody}</div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

function SectionFormDispatch({
  sectionKey,
  content,
  onAutoSave,
  onExplicitSave,
  onCancel,
  isSaving,
}: {
  sectionKey: SectionKey;
  content: unknown;
  onAutoSave: (next: Record<string, unknown>) => Promise<void>;
  onExplicitSave: (next: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  switch (sectionKey) {
    case "snapshot":
      return (
        <SnapshotForm
          initial={content as never}
          onAutoSave={onAutoSave}
          onExplicitSave={onExplicitSave}
          onCancel={onCancel}
          isSaving={isSaving}
        />
      );
    case "parentAvatar":
      return (
        <ParentAvatarForm
          initial={content as never}
          onAutoSave={onAutoSave}
          onExplicitSave={onExplicitSave}
          onCancel={onCancel}
          isSaving={isSaving}
        />
      );
    case "programmeMix":
      return (
        <ProgrammeMixForm
          initial={content as never}
          onAutoSave={onAutoSave}
          onExplicitSave={onExplicitSave}
          onCancel={onCancel}
          isSaving={isSaving}
        />
      );
    case "assetLibrary":
      return (
        <AssetLibraryForm
          initial={content as never}
          onAutoSave={onAutoSave}
          onExplicitSave={onExplicitSave}
          onCancel={onCancel}
          isSaving={isSaving}
        />
      );
  }
}

/**
 * Raw JSON fallback — preserves the v1 power-user editor for cases the form
 * can't represent (e.g. one-off cleanups, schema migrations).
 */
function RawJsonEditor({
  title,
  content,
  onSave,
  onCancel,
  isSaving,
}: {
  title: string;
  content: unknown;
  onSave: (next: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<string>(() => JSON.stringify(content ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

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
    await onSave(parsed as Record<string, unknown>);
  };

  const format = () => {
    try {
      const parsed = draft.trim() === "" ? {} : JSON.parse(draft);
      setDraft(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {
      setError("Can't format — JSON is invalid.");
    }
  };

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && (e.key === "Enter" || e.key === "s")) {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        spellCheck={false}
        rows={18}
        autoFocus
        aria-label={`${title} JSON editor`}
        className="w-full rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs font-mono focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          <kbd className="rounded bg-surface px-1 py-0.5 font-mono">⌘</kbd>
          <kbd className="ml-0.5 rounded bg-surface px-1 py-0.5 font-mono">↵</kbd> save ·{" "}
          <kbd className="rounded bg-surface px-1 py-0.5 font-mono">Esc</kbd> cancel
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={format}
            className="rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground/80 hover:bg-surface"
          >
            Format
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}
    </div>
  );
}
