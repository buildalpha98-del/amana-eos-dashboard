"use client";

/**
 * /settings/ai-knowledge — Knowledge Library admin surface.
 *
 * Admins paste in plain-text knowledge sources (Amana Way, Employee
 * Handbook, Proven Process, anything else). The text is chunked and
 * stored in DocumentChunk so the existing `search_knowledge_base`
 * tool the AI assistant calls can find it.
 *
 * Owner / admin / head_office can edit. No staff access — these
 * surfaces edit the knowledge the bot draws from, not the bot itself.
 *
 * 2026-06-02.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Plus,
  Loader2,
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface KnowledgeEntrySummary {
  id: string;
  title: string;
  description: string | null;
  indexed: boolean;
  indexedAt: string | null;
  indexError: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { chunks: number };
}

interface KnowledgeEntryDetail {
  id: string;
  title: string;
  body: string;
  indexed: boolean;
  indexedAt: string | null;
  indexError: string | null;
  chunkCount: number;
}

// Seed suggestions shown when the library is empty. Picking one
// pre-fills the title in the editor so the admin can paste straight
// in. Not exhaustive — admin can name new entries anything.
const SEED_SUGGESTIONS = [
  { title: "The Amana Way", hint: "Our handbook of values + how we work" },
  { title: "Employee Handbook", hint: "Conditions, policies, procedures" },
  { title: "Proven Process", hint: "How we run the business — the EOS playbook" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AiKnowledgePage() {
  const [editing, setEditing] = useState<{
    mode: "create" | "edit";
    id?: string;
    initialTitle?: string;
  } | null>(null);

  const { data, isLoading, error } = useQuery<
    { entries: KnowledgeEntrySummary[] },
    ApiResponseError
  >({
    queryKey: ["ai-knowledge"],
    queryFn: () => fetchApi("/api/settings/ai-knowledge"),
    staleTime: 30_000,
  });

  const entries = data?.entries ?? [];

  const qc = useQueryClient();
  const seedMut = useMutation({
    mutationFn: () =>
      mutateApi<{
        results: Array<{ title: string; status: "created" | "skipped" }>;
      }>("/api/settings/ai-knowledge/seed", { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      const created = data.results.filter((r) => r.status === "created").length;
      const skipped = data.results.filter((r) => r.status === "skipped").length;
      toast({
        description: created
          ? `Seeded ${created} starter ${created === 1 ? "entry" : "entries"}.${skipped ? ` (${skipped} already existed.)` : ""}`
          : "All starter entries already exist — nothing to seed.",
      });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader title="AI Knowledge Library">
        <p className="text-sm text-muted">
          The text snippets the AI assistant searches when staff ask
          questions. Each entry is chunked, indexed, and available to
          the bot&apos;s knowledge-base lookup.
        </p>
      </PageHeader>

      <div className="rounded-md border border-blue-200 bg-blue-50/40 p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">How this works</p>
        <p className="text-xs">
          Paste in the content (e.g. your Amana Way handbook, employee
          handbook, proven process). The AI bot searches across all
          entries when staff ask questions. Updates take effect
          immediately — no re-deploy needed.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => seedMut.mutate()}
          disabled={seedMut.isPending}
          title="Pre-fill the library with starter Amana Way, Employee Handbook, and Proven Process entries. Idempotent — re-running skips existing entries."
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border border-border rounded-md hover:bg-surface disabled:opacity-50"
        >
          {seedMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-500" />
          )}
          {seedMut.isPending ? "Seeding…" : "Seed starter content"}
        </button>
        <button
          type="button"
          onClick={() => setEditing({ mode: "create" })}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
        >
          <Plus className="w-4 h-4" />
          New entry
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">Unable to load entries.</p>
      ) : entries.length === 0 ? (
        <EmptyState onPick={(title) => setEditing({ mode: "create", initialTitle: title })} />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="bg-card rounded-lg border border-border p-4 flex flex-wrap items-start gap-3 hover:bg-surface/40 cursor-pointer"
              onClick={() => setEditing({ mode: "edit", id: e.id })}
            >
              <div className="shrink-0 p-2 rounded-md bg-brand/10 text-brand">
                <Brain className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {e.title}
                  </span>
                  {e.indexed ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />
                      Indexed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                      <AlertTriangle className="w-3 h-3" />
                      Not indexed
                    </span>
                  )}
                  {e.indexError && (
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                      Error
                    </span>
                  )}
                </div>
                {e.description && (
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">
                    {e.description}
                  </p>
                )}
                <p className="text-xs text-muted mt-1">
                  {e._count.chunks} chunk{e._count.chunks === 1 ? "" : "s"} ·
                  last indexed {formatDate(e.indexedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EntryModal
          mode={editing.mode}
          id={editing.id}
          initialTitle={editing.initialTitle}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (title: string) => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <Brain className="w-10 h-10 mx-auto text-border mb-3" />
      <p className="text-sm font-medium text-foreground">
        No knowledge entries yet
      </p>
      <p className="text-xs text-muted mt-1 max-w-md mx-auto">
        Add entries below to give the AI bot something to draw on when
        staff ask questions. You can paste in any plain-text content
        (markdown is fine).
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SEED_SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s.title)}
            className="inline-flex flex-col items-start gap-0.5 px-3 py-2 text-left text-sm border border-border rounded-md hover:bg-surface"
          >
            <span className="font-medium text-foreground">{s.title}</span>
            <span className="text-xs text-muted">{s.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Create / edit modal ────────────────────────────────────────────

function EntryModal({
  mode,
  id,
  initialTitle,
  onClose,
}: {
  mode: "create" | "edit";
  id?: string;
  initialTitle?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = mode === "edit";

  const { data: existing } = useQuery<KnowledgeEntryDetail, ApiResponseError>({
    queryKey: ["ai-knowledge", id],
    queryFn: () => fetchApi(`/api/settings/ai-knowledge/${id}`),
    enabled: isEdit && !!id,
  });

  const [title, setTitle] = useState(initialTitle ?? "");
  const [body, setBody] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (existing && !hydrated) {
      setTitle(existing.title);
      setBody(existing.body);
      setHydrated(true);
    }
  }, [existing, hydrated]);

  const byteSize = useMemo(() => Buffer.byteLength(body, "utf-8"), [body]);

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? mutateApi(`/api/settings/ai-knowledge/${id}`, {
            method: "PATCH",
            body: { title: title.trim(), body },
          })
        : mutateApi("/api/settings/ai-knowledge", {
            method: "POST",
            body: { title: title.trim(), body },
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      toast({
        description: isEdit
          ? "Knowledge entry updated and re-indexed."
          : "Knowledge entry created and indexed.",
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const del = useMutation({
    mutationFn: () =>
      mutateApi(`/api/settings/ai-knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      toast({ description: "Knowledge entry deleted." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const handleDelete = () => {
    if (!window.confirm("Delete this knowledge entry? Bot will no longer have access to it.")) return;
    del.mutate();
  };

  const canSave =
    !!title.trim() && !!body.trim() && byteSize <= 500_000 && !save.isPending;

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
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-foreground">
                Body
              </label>
              <span
                className={`text-xs ${byteSize > 500_000 ? "text-red-600" : "text-muted"}`}
              >
                {byteSize.toLocaleString()} / 500,000 bytes
              </span>
            </div>
            <textarea
              rows={20}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={save.isPending}
              placeholder="Paste in the content. Markdown headings (# Heading) are detected and used to chunk by section for better retrieval."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-muted mt-1">
              Tip: include headings (Markdown <code>#</code> style) so the
              chunker can split on natural section boundaries —
              improves retrieval quality.
            </p>
          </div>
        </div>

        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-between gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={save.isPending || del.isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                {del.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending}
              className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-md border border-border disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!canSave}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isEdit ? (
                <Pencil className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {save.isPending
                ? "Saving…"
                : isEdit
                  ? "Save & re-index"
                  : "Save & index"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
