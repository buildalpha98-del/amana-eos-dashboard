"use client";

/**
 * StaffTagEditor — admin-only inline editor for `User.tags` on the
 * staff profile header. Admins can:
 *   - remove a tag with the × on each pill
 *   - add a new tag via the "+ Add tag" button → text input (Enter
 *     to save, Esc to cancel)
 *
 * Saves the FULL tag list to PATCH /api/users/[id]/profile (the
 * server replaces the array atomically — no partial update). On
 * success the parent's query is invalidated so other surfaces
 * (/team, /staff/[id]) repaint with the new state.
 *
 * Read-only viewers (non-admin) just see the pills; the × and the
 * "+ Add" affordance both disappear so the row stays clean.
 *
 * 2026-05-12: introduced (Bucket C — staff tags).
 */

import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X as XIcon, Plus, Loader2 } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import { normaliseTag, MAX_TAGS_PER_USER } from "@/lib/staff-tags";
import { cn } from "@/lib/utils";

interface StaffTagEditorProps {
  userId: string;
  tags: readonly string[];
  /** Only admins get the × on pills and the "+ Add tag" button. */
  canEdit: boolean;
}

export function StaffTagEditor({
  userId,
  tags,
  canEdit,
}: StaffTagEditorProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string[]>([...tags]);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Resync when the parent re-fetches (e.g. after another admin
  // edits). setState-in-effect is intentional here — syncing an
  // external store (parent-passed tags) into local draft state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft([...tags]);
  }, [tags]);

  const mutation = useMutation<unknown, Error, string[]>({
    mutationFn: (next) =>
      mutateApi(`/api/users/${userId}/profile`, {
        method: "PATCH",
        body: { tags: next },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees-list"] });
      qc.invalidateQueries({ queryKey: ["employee-tags"] });
      qc.invalidateQueries({ queryKey: ["staff", userId] });
    },
    onError: (err, _vars, ctx) => {
      // Roll back to whatever was current before this mutation kicked
      // off; the parent's invalidation will overwrite on success.
      const previous = ctx as string[] | undefined;
      if (previous) setDraft(previous);
      toast({
        variant: "destructive",
        description: err.message || "Failed to update tags",
      });
    },
  });

  function commit(next: string[]) {
    const previous = draft;
    setDraft(next);
    mutation.mutate(next, { onError: () => setDraft(previous) });
  }

  function handleAdd() {
    const normalised = normaliseTag(input);
    setInput("");
    setAdding(false);
    if (!normalised) {
      toast({
        variant: "destructive",
        description:
          "Tags can only contain letters, numbers, hyphens — 1 to 30 chars.",
      });
      return;
    }
    if (draft.includes(normalised)) return; // dedup
    if (draft.length >= MAX_TAGS_PER_USER) {
      toast({
        variant: "destructive",
        description: `Maximum ${MAX_TAGS_PER_USER} tags per user.`,
      });
      return;
    }
    commit([...draft, normalised]);
  }

  function handleRemove(tag: string) {
    commit(draft.filter((t) => t !== tag));
  }

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  if (!canEdit && draft.length === 0) return null;

  return (
    <div
      className="inline-flex flex-wrap items-center gap-1.5"
      data-testid="staff-tag-editor"
    >
      {draft.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-surface text-foreground/80 text-xs px-2 py-0.5 border border-border"
          data-testid={`staff-tag-${t}`}
        >
          {t}
          {canEdit ? (
            <button
              type="button"
              onClick={() => handleRemove(t)}
              disabled={mutation.isPending}
              aria-label={`Remove ${t}`}
              className="hover:text-red-700 disabled:opacity-50"
            >
              <XIcon className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
      {canEdit ? (
        adding ? (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onBlur={handleAdd}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              } else if (e.key === "Escape") {
                setInput("");
                setAdding(false);
              }
            }}
            placeholder="tag-name"
            className="rounded border border-border px-1.5 py-0.5 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-brand"
            data-testid="staff-tag-input"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={mutation.isPending || draft.length >= MAX_TAGS_PER_USER}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-dashed border-border text-muted text-xs px-2 py-0.5",
              "hover:bg-surface disabled:opacity-50",
            )}
            data-testid="staff-tag-add"
          >
            {mutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Add tag
          </button>
        )
      ) : null}
    </div>
  );
}
