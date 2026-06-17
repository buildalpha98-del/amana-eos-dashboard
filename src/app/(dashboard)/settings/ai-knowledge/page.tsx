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

import { useEffect, useMemo, useState, useRef } from "react";
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
  Upload,
  FileText,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

interface KnowledgeEntrySummary {
  id: string;
  title: string;
  description: string | null;
  fileName: string | null;
  fileUrl: string;
  mimeType: string | null;
  /** "text" = pasted-in entry editable inline; "file" = uploaded
   *  PDF/DOCX/etc. with a download link. */
  kind: "text" | "file";
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
  /** Same discriminator as the list endpoint — file entries make the
   *  body textarea read-only since you can't edit a PDF's text inline. */
  kind: "text" | "file";
  fileName: string | null;
  fileUrl: string | null;
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
  // Hidden <input type="file"> we trigger from the visible Upload
  // button. Lets us style the button consistently with other actions.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk upload progress — surfaced when more than one file is dropped/picked.
  const [bulkProgress, setBulkProgress] = useState<{
    total: number;
    done: number;
    failed: number;
    current: string | null;
  } | null>(null);

  const uploadOne = async (file: File) => {
    // Client-direct upload to Vercel Blob via @vercel/blob/client.
    // File bytes go browser → Blob directly; our API only mediates
    // the token + the post-upload Document creation. Sidesteps the
    // serverless function body-size limit (~4.5 MB) — handles up to
    // the 50 MB server-side cap configured in onBeforeGenerateToken.
    const { upload } = await import("@vercel/blob/client");
    const title = file.name.replace(/\.[^.]+$/, "");

    // Some browsers (notably macOS Chrome) report an empty / generic
    // content-type for .zip and other archive formats. The Blob token
    // is generated against a fixed allow-list, so a mismatched MIME
    // here would either reject the token or — worse — hang the
    // upload SDK on a silent retry loop. Infer from extension so we
    // always send something the allow-list accepts.
    const ext = file.name.split(".").pop()?.toLowerCase();
    const EXT_MIME: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      txt: "text/plain",
      md: "text/markdown",
      zip: "application/zip",
    };
    const contentType =
      file.type && file.type !== "application/octet-stream"
        ? file.type
        : (ext && EXT_MIME[ext]) || "application/octet-stream";

    const blob = await upload(`ai-knowledge/${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/settings/ai-knowledge/upload",
      contentType,
      clientPayload: JSON.stringify({ title }),
    });

    // 2026-06-17: don't rely on the onUploadCompleted webhook — it
    // can drop work silently under bulk fan-out. Ping the register
    // endpoint directly with the blob URL. It's idempotent so an
    // eventual webhook arriving later won't double-create.
    await mutateApi<{
      id: string;
      indexed: boolean;
      indexError: string | null;
      chunkCount: number;
    }>("/api/settings/ai-knowledge/register", {
      method: "POST",
      body: {
        blobUrl: blob.url,
        fileName: file.name,
        title,
        mimeType: contentType,
        fileSize: file.size,
      },
    });

    return { url: blob.url, title };
  };

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      // Sequential, not parallel — Vercel Blob token generation +
      // indexing both touch the DB; running 80 in parallel would
      // hammer the connection pool and the embedding API.
      let done = 0;
      let failed = 0;
      const failures: string[] = [];
      setBulkProgress({ total: files.length, done: 0, failed: 0, current: null });
      for (const file of files) {
        setBulkProgress({
          total: files.length,
          done,
          failed,
          current: file.name,
        });
        try {
          await uploadOne(file);
          done += 1;
        } catch (err) {
          failed += 1;
          failures.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      setBulkProgress({
        total: files.length,
        done,
        failed,
        current: null,
      });
      return { total: files.length, done, failed, failures };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      if (data.failed === 0) {
        toast({
          description:
            data.total === 1
              ? `Uploaded — indexing in the background. Refresh in a moment.`
              : `Uploaded ${data.done} files — indexing in the background.`,
        });
      } else {
        toast({
          variant: "destructive",
          description: `${data.done} uploaded, ${data.failed} failed. First failure: ${data.failures[0]?.slice(0, 120) ?? "unknown"}`,
        });
      }
      // Clear progress card after a beat so the user sees the final tally.
      setTimeout(() => setBulkProgress(null), 4000);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
      setBulkProgress(null);
    },
  });

  // Drag-and-drop state — visual only, the FileList comes through onDrop.
  const [isDragging, setIsDragging] = useState(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadMut.mutate(files);
  };

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

  // Retries indexing for every file that's still `indexed=false`.
  // Useful when a bulk zip upload partially completes and a handful
  // of rows are stuck without an Indexed badge.
  const reindexMut = useMutation({
    mutationFn: () =>
      mutateApi<{
        checked: number;
        done: number;
        failed: number;
        failures: { title: string; error: string }[];
      }>("/api/settings/ai-knowledge/reindex", { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      if (data.checked === 0) {
        toast({ description: "Nothing to re-index — every file is already indexed." });
        return;
      }
      if (data.failed === 0) {
        toast({ description: `Re-indexed ${data.done} of ${data.checked} files.` });
      } else {
        toast({
          variant: "destructive",
          description: `Re-indexed ${data.done}/${data.checked}. ${data.failed} failed — first: ${data.failures[0]?.error?.slice(0, 120) ?? "unknown"}`,
        });
      }
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  // Backfill missing Document rows from Blob storage. Use after a
  // bulk upload where the webhook may have dropped — walks the
  // ai-knowledge/ prefix in Blob and creates Document rows for any
  // orphaned files, then indexes them.
  const backfillMut = useMutation({
    mutationFn: () =>
      mutateApi<{
        totalInStorage: number;
        alreadyRegistered: number;
        newlyCreated: number;
        newlyIndexed: number;
        failed: number;
        failures: { fileName: string; error: string }[];
      }>("/api/settings/ai-knowledge/backfill", { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      if (data.newlyCreated === 0 && data.totalInStorage === 0) {
        toast({ description: "No files found in storage to recover." });
        return;
      }
      if (data.newlyCreated === 0) {
        toast({ description: `Nothing new — all ${data.totalInStorage} storage files are already in the library.` });
        return;
      }
      const msg = `Recovered ${data.newlyCreated} file${data.newlyCreated === 1 ? "" : "s"} from storage (${data.newlyIndexed} indexed${data.failed ? `, ${data.failed} failed` : ""}).`;
      toast({
        description: data.failed
          ? `${msg} First error: ${data.failures[0]?.error?.slice(0, 120) ?? "unknown"}`
          : msg,
        variant: data.failed ? "destructive" : undefined,
      });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  // 2026-06-17: auto-trigger reindex once per page load if any entries
  // are unindexed. The Vercel Blob webhook that runs indexDocument on
  // first upload can drop work under load (large zip fan-outs, cold
  // starts). Letting the page heal itself means coordinators don't
  // need to remember the manual button.
  const autoReindexedRef = useRef(false);
  useEffect(() => {
    if (autoReindexedRef.current) return;
    if (!entries || entries.length === 0) return;
    const unindexed = entries.filter((e) => !e.indexed);
    if (unindexed.length === 0) return;
    autoReindexedRef.current = true;
    reindexMut.mutate();
    // intentionally exclude reindexMut from deps — its identity
    // changes every render and would cause a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

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

      {/* Library size — confirms documents + chunks are actually
          there. Quick sanity check when the bot says it "can't find"
          something the user just uploaded. */}
      {!isLoading && entries.length > 0 && (() => {
        const indexedCount = entries.filter((e) => e.indexed).length;
        const totalChunks = entries.reduce((s, e) => s + e._count.chunks, 0);
        const errored = entries.filter((e) => e.indexError).length;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">Documents</p>
              <p className="text-2xl font-bold text-foreground">{entries.length}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">Indexed</p>
              <p className={cn(
                "text-2xl font-bold",
                indexedCount === entries.length ? "text-emerald-600" : "text-amber-600",
              )}>
                {indexedCount}/{entries.length}
              </p>
            </div>
            <div className="bg-card rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">Chunks</p>
              <p className="text-2xl font-bold text-foreground">{totalChunks}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">Errors</p>
              <p className={cn(
                "text-2xl font-bold",
                errored === 0 ? "text-emerald-600" : "text-red-600",
              )}>
                {errored}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Drag-and-drop zone — accepts a folder or multi-selection of
          PDFs/DOCXs. Uploads sequentially so we don't hammer the
          embedding API or the Blob token endpoint. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploadMut.isPending && fileInputRef.current?.click()}
        className={[
          "rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
          isDragging
            ? "border-brand bg-brand/5"
            : "border-border bg-surface/30 hover:bg-surface/60",
          uploadMut.isPending ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        <Upload className="w-6 h-6 mx-auto text-muted mb-2" />
        <p className="text-sm font-medium text-foreground">
          Drag a folder or files here, or click to pick
        </p>
        <p className="text-xs text-muted mt-1">
          PDF, DOCX, DOC, TXT, MD, ZIP · up to 50 MB each · drop a zip
          and we unpack + index every supported file inside
        </p>
      </div>

      {bulkProgress && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">
              {bulkProgress.current
                ? `Uploading ${bulkProgress.done + bulkProgress.failed + 1} of ${bulkProgress.total}`
                : `Finished — ${bulkProgress.done} uploaded${bulkProgress.failed ? `, ${bulkProgress.failed} failed` : ""}`}
            </span>
            <span className="text-xs text-muted">
              {Math.round(
                ((bulkProgress.done + bulkProgress.failed) /
                  bulkProgress.total) *
                  100,
              )}
              %
            </span>
          </div>
          <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-brand transition-all"
              style={{
                width: `${((bulkProgress.done + bulkProgress.failed) / bulkProgress.total) * 100}%`,
              }}
            />
          </div>
          {bulkProgress.current && (
            <p className="text-xs text-muted truncate">{bulkProgress.current}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => backfillMut.mutate()}
          disabled={backfillMut.isPending}
          title="Scan Vercel Blob storage and recover any files that were uploaded but never registered in the dashboard. Safe to click any time."
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border border-border rounded-md hover:bg-surface disabled:opacity-50"
        >
          {backfillMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 text-blue-500" />
          )}
          {backfillMut.isPending ? "Recovering…" : "Recover from storage"}
        </button>
        <button
          type="button"
          onClick={() => reindexMut.mutate()}
          disabled={reindexMut.isPending}
          title="Retry indexing for any file that's still showing 'Not indexed'. Safe to click any time — finished files are skipped."
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border border-border rounded-md hover:bg-surface disabled:opacity-50"
        >
          {reindexMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          )}
          {reindexMut.isPending ? "Re-indexing…" : "Re-index unindexed"}
        </button>
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
        {/* Hidden native input — visible button triggers it via ref.
            Restricting `accept` is a UX hint only (clients can pick
            anything); server validates type + size. */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.md,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) uploadMut.mutate(files);
            // Reset so picking the same file twice re-fires onChange.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border border-border rounded-md hover:bg-surface disabled:opacity-50"
        >
          {uploadMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {uploadMut.isPending ? "Uploading…" : "Upload PDF / Word"}
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
              {/* File entries get the doc icon + a different background
                  so they're visually distinct from the pasted-text
                  entries (which remain Brain-iconed). */}
              <div
                className={
                  e.kind === "file"
                    ? "shrink-0 p-2 rounded-md bg-blue-50 text-blue-700"
                    : "shrink-0 p-2 rounded-md bg-brand/10 text-brand"
                }
              >
                {e.kind === "file" ? (
                  <FileText className="w-4 h-4" />
                ) : (
                  <Brain className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {e.title}
                  </span>
                  {e.kind === "file" && (
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                      {(e.fileName?.split(".").pop() ?? "FILE").toUpperCase()}
                    </span>
                  )}
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
                    <span
                      className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800"
                      title={e.indexError}
                    >
                      Error
                    </span>
                  )}
                </div>
                {e.indexError && (
                  <p className="text-xs text-red-700 mt-0.5">
                    {e.indexError}
                  </p>
                )}
                {!e.indexError && e.description && (
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">
                    {e.description}
                  </p>
                )}
                <p className="text-xs text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span>
                    {e._count.chunks} chunk{e._count.chunks === 1 ? "" : "s"} ·
                    last indexed {formatDate(e.indexedAt)}
                  </span>
                  {e.kind === "file" && e.fileUrl && (
                    <a
                      href={e.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      Open original <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
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
                {existing?.kind === "file"
                  ? "Extracted text (read-only)"
                  : "Body"}
              </label>
              <span
                className={`text-xs ${byteSize > 500_000 ? "text-red-600" : "text-muted"}`}
              >
                {byteSize.toLocaleString()}
                {existing?.kind === "file"
                  ? ` bytes (from ${existing.fileName})`
                  : " / 500,000 bytes"}
              </span>
            </div>
            <textarea
              rows={20}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={save.isPending || existing?.kind === "file"}
              readOnly={existing?.kind === "file"}
              placeholder={
                existing?.kind === "file"
                  ? ""
                  : "Paste in the content. Markdown headings (# Heading) are detected and used to chunk by section for better retrieval."
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
            />
            {existing?.kind === "file" ? (
              <p className="text-xs text-muted mt-1">
                This is the text extracted from{" "}
                <code>{existing.fileName}</code> at upload time. To
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
