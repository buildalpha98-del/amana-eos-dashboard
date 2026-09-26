"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import { CATEGORIES, isCategory, isFile, isTier, type Category, type KnowledgeEntryDetail, type Tier } from "./types";

// ─── Create / edit modal ────────────────────────────────────────────

/**
 * Create a pasted-text `manual` source, or edit an existing manual one.
 * Uploaded files (Blob-backed) can only be renamed here — the route 409s
 * on a body edit, so the textarea is read-only and `save` sends `{ title }`.
 *
 * Delete is the page's mutation (`onDelete`) — one confirm string, one
 * success path — so the row's trash icon and this footer can't drift.
 */
export function EntryModal({
  mode,
  id,
  onClose,
  onDelete,
  deleting = false,
}: {
  mode: "create" | "edit";
  id?: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  /** The page's delete mutation is in flight for this entry. */
  deleting?: boolean;
}) {
  useEscapeClose(onClose);
  const qc = useQueryClient();
  const isEdit = mode === "edit";

  const { data: existing } = useQuery<KnowledgeEntryDetail, ApiResponseError>({
    queryKey: ["ai-knowledge", id],
    queryFn: () => fetchApi(`/api/settings/ai-knowledge/${id}`),
    enabled: isEdit && !!id,
    retry: 2,
    staleTime: 30_000,
  });
  const fileEntry = !!existing && isFile(existing);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("guide");
  // "auto" sends nothing — the pipeline's inferTier() decides.
  const [tier, setTier] = useState<Tier | "auto">("auto");
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once when the existing entry loads (render-time sync guarded by
  // the hydrated flag, per React's "adjusting state when props change" pattern)
  if (existing && !hydrated) {
    setHydrated(true);
    setTitle(existing.title);
    setBody(existing.body);
  }

  const byteSize = useMemo(() => new TextEncoder().encode(body).length, [body]);

  const save = useMutation({
    mutationFn: async (): Promise<{ outcome?: string; error?: string | null }> => {
      if (isEdit) {
        await mutateApi(`/api/settings/ai-knowledge/${id}`, {
          method: "PATCH",
          // A file's text lives in Blob — only the title is editable.
          body: fileEntry ? { title: title.trim() } : { title: title.trim(), body },
        });
        return {};
      }
      return mutateApi<{ id: string; outcome: string; error: string | null }>("/api/settings/ai-knowledge", {
        method: "POST",
        body: { title: title.trim(), body, category, ...(tier === "auto" ? {} : { tier }) },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      if (res.outcome === "error") {
        // The row exists (re-index retries it) but nothing is searchable yet.
        toast({
          variant: "destructive",
          description: `Saved, but indexing failed: ${res.error ?? "unknown error"}. Use Re-index on the row to retry.`,
        });
      } else {
        toast({
          description: isEdit
            ? fileEntry
              ? "Knowledge entry renamed."
              : "Knowledge entry saved."
            : "Knowledge entry created and indexed.",
        });
      }
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message || "Something went wrong" }),
  });

  const canSave =
    !!title.trim() &&
    (fileEntry || (!!body.trim() && byteSize <= 500_000)) &&
    !save.isPending;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose();
      }}
    >
      <div className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-3xl flex flex-col shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            {isEdit ? "Edit knowledge entry" : "New knowledge entry"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={save.isPending}
              placeholder="e.g. The Amana Way"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
            />
          </div>
          {!isEdit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ai-knowledge-category" className="block text-sm font-medium text-foreground mb-1">
                  Category
                </label>
                <select
                  id="ai-knowledge-category"
                  value={category}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isCategory(v)) setCategory(v);
                  }}
                  disabled={save.isPending}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ai-knowledge-tier" className="block text-sm font-medium text-foreground mb-1">
                  Tier
                </label>
                <select
                  id="ai-knowledge-tier"
                  value={tier}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTier(isTier(v) ? v : "auto");
                  }}
                  disabled={save.isPending}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  <option value="auto">Auto (inferred from the content)</option>
                  <option value="safety_critical">Safety-critical</option>
                  <option value="general">General</option>
                </select>
                <p className="text-xs text-muted mt-1">
                  Safety-critical sources are quoted verbatim by the assistant, never paraphrased.
                </p>
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-foreground">
                {fileEntry ? "Extracted text (read-only)" : "Body"}
              </label>
              <span
                className={`text-xs ${byteSize > 500_000 ? "text-danger" : "text-muted"}`}
              >
                {byteSize.toLocaleString()}
                {fileEntry ? " bytes (extracted from the uploaded file)" : " / 500,000 bytes"}
              </span>
            </div>
            <textarea
              rows={20}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={save.isPending || fileEntry}
              readOnly={fileEntry}
              placeholder={
                fileEntry
                  ? ""
                  : "Paste in the content. Markdown headings (# Heading) are detected and used to chunk by section for better retrieval."
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
            />
            {fileEntry ? (
              <p className="text-xs text-muted mt-1">
                This is the text extracted from{" "}
                <code>{existing.title}</code> at upload time. To
                change the content, delete this entry and re-upload.
                You can still rename it via the Title field above.
              </p>
            ) : (
              <p className="text-xs text-muted mt-1">
                Tip: include headings (Markdown <code>#</code> style) so
                the chunker can split on natural section boundaries —
                improves retrieval quality.
              </p>
            )}
          </div>
        </div>

        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-between gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div>
            {isEdit && id && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(id)}
                loading={deleting}
                disabled={save.isPending}
                iconLeft={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={save.isPending || deleting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!canSave || deleting}
              iconLeft={isEdit ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            >
              {save.isPending
                ? "Saving…"
                : isEdit
                  ? fileEntry
                    ? "Save"
                    : "Save & re-index"
                  : "Save & index"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
