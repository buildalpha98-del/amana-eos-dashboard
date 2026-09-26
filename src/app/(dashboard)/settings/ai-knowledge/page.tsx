"use client";

/**
 * /settings/ai-knowledge — AI Knowledge console.
 *
 * One table over every KnowledgeSource the assistant's `search_knowledge`
 * tool retrieves from: adapter-owned rows (handbook, help articles, centre
 * facts, published training modules, current policy PDFs, regulator refs,
 * SharePoint imports) beside admin-pasted / uploaded `manual` rows.
 *
 * Manual rows are created, edited and deleted here. Everything else changes
 * at its origin — from this page it can only be tier-overridden, excluded /
 * restored, or re-indexed (per row). The toolbar kicks the server-runnable
 * adapters (dashboard backfill, regulator refresh, handbook re-sync).
 *
 * Owner / admin / head_office can edit. No staff access — these surfaces
 * edit the knowledge the bot draws from, not the bot itself.
 */

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, Plus, Upload, RefreshCw, Globe, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { KnowledgeSourceRow } from "@/components/settings/ai-knowledge/KnowledgeSourceRow";
import { EntryModal } from "@/components/settings/ai-knowledge/EntryModal";
import { LastSyncPanel } from "@/components/settings/ai-knowledge/LastSyncPanel";
import {
  KIND_LABEL,
  type KnowledgeEntrySummary,
  type SourceKind,
  type Status,
  type SyncRunSummary,
  type Tier,
} from "@/components/settings/ai-knowledge/types";

// Seed suggestions shown when the library is empty. Picking one
// pre-fills the title in the editor so the admin can paste straight
// in. Not exhaustive — admin can name new entries anything.
const SEED_SUGGESTIONS = [
  { title: "The Amana Way", hint: "Our handbook of values + how we work" },
  { title: "Employee Handbook", hint: "Conditions, policies, procedures" },
  { title: "Proven Process", hint: "How we run the business — the EOS playbook" },
];

/** What POST /register (and the seed route's per-source results) report. */
interface RegisterResult {
  id: string | null;
  outcome: string;
  error: string | null;
  /** Set when the upload was left to the webhook (zips). */
  reason?: string;
}

const KINDS = Object.keys(KIND_LABEL) as SourceKind[];
const STATUSES: { value: Status | "all"; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "superseded", label: "Superseded" },
  { value: "excluded", label: "Excluded" },
  { value: "all", label: "All statuses" },
];

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
    retry: 2,
    staleTime: 30_000,
  });

  const entries = useMemo(() => data?.entries ?? [], [data]);

  // ── Filters (client-side over the full list) ─────────────────
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<SourceKind | "all">("all");
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("active");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (kindFilter !== "all" && e.sourceKind !== kindFilter) return false;
      if (tierFilter !== "all" && (e.tierOverride ?? e.tier) !== tierFilter) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (q && !e.title.toLowerCase().includes(q) && !(e.serviceName ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, kindFilter, tierFilter, statusFilter]);

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

  const uploadOne = async (file: File): Promise<RegisterResult> => {
    // Client-direct upload to Vercel Blob via @vercel/blob/client.
    // File bytes go browser → Blob directly; our API only mediates
    // the token + the post-upload KnowledgeSource creation. Sidesteps
    // the serverless function body-size limit (~4.5 MB) — handles up
    // to the 50 MB server-side cap configured in onBeforeGenerateToken.
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
    // eventual webhook arriving later won't double-create. Zips are
    // the exception: register short-circuits (`reason`) and the
    // webhook unpacks + registers one source per entry.
    return mutateApi<RegisterResult>("/api/settings/ai-knowledge/register", {
      method: "POST",
      body: {
        blobUrl: blob.url,
        fileName: file.name,
        title,
        mimeType: contentType,
        fileSize: file.size,
      },
    });
  };

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      // Sequential, not parallel — Vercel Blob token generation +
      // indexing both touch the DB; running 80 in parallel would
      // hammer the connection pool and the embedding API.
      let indexed = 0;
      let unchanged = 0;
      let queued = 0;
      let failed = 0;
      const failures: string[] = [];
      setBulkProgress({ total: files.length, done: 0, failed: 0, current: null });
      for (const file of files) {
        setBulkProgress({
          total: files.length,
          done: indexed + unchanged + queued,
          failed,
          current: file.name,
        });
        try {
          const r = await uploadOne(file);
          if (r.outcome === "error") {
            failed += 1;
            failures.push(`${file.name}: ${r.error ?? "indexing failed"}`);
          } else if (r.reason) {
            queued += 1;
          } else if (r.outcome === "unchanged") {
            unchanged += 1;
          } else {
            indexed += 1;
          }
        } catch (err) {
          failed += 1;
          failures.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      setBulkProgress({
        total: files.length,
        done: indexed + unchanged + queued,
        failed,
        current: null,
      });
      return { total: files.length, indexed, unchanged, queued, failed, failures };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      if (data.failed === 0) {
        const parts = [`${data.indexed} indexed`];
        if (data.unchanged) parts.push(`${data.unchanged} unchanged`);
        if (data.queued) parts.push(`${data.queued} zip${data.queued === 1 ? "" : "s"} unpacking in the background`);
        toast({
          description: `Uploaded ${data.total} file${data.total === 1 ? "" : "s"} — ${parts.join(", ")}.`,
        });
      } else {
        toast({
          variant: "destructive",
          description: `${data.indexed + data.unchanged + data.queued} uploaded, ${data.failed} failed. First failure: ${data.failures[0]?.slice(0, 120) ?? "unknown"}`,
        });
      }
      // Clear progress card after a beat so the user sees the final tally.
      setTimeout(() => setBulkProgress(null), 4000);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Upload failed" });
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

  // Handbook re-sync — idempotent (a matching contentHash is a no-op).
  const seedMut = useMutation({
    mutationFn: () =>
      mutateApi<{ results: { sourceId: string; outcome: string; error?: string }[] }>(
        "/api/settings/ai-knowledge/seed",
        { method: "POST" },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      const by = (o: string) => data.results.filter((r) => r.outcome === o).length;
      const indexed = by("created") + by("updated");
      const unchanged = by("unchanged");
      const errors = by("error");
      toast({
        description: `${indexed} indexed, ${unchanged} unchanged, ${errors} failed`,
        ...(errors ? { variant: "destructive" as const } : {}),
      });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message || "Re-index failed" }),
  });

  // Server-runnable adapters. `backfill` walks every dashboard-owned source;
  // `regulator` re-fetches the ACECQA / state-regulator reference pages.
  const sync = useMutation({
    mutationFn: (adapter: "backfill" | "regulator") =>
      mutateApi<SyncRunSummary>("/api/settings/ai-knowledge/sync", {
        method: "POST",
        body: { adapter },
      }),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      qc.invalidateQueries({ queryKey: ["ai-knowledge-sync-runs"] });
      const c = run.counts ?? {};
      toast({
        description: run.error
          ? `Sync failed: ${run.error}`
          : `Sync done — ${c.created ?? 0} new, ${c.updated ?? 0} updated, ${c.unchanged ?? 0} unchanged, ${c.errors ?? 0} errors.`,
        ...(run.error ? { variant: "destructive" as const } : {}),
      });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message || "Sync failed" }),
  });

  // Row-level delete (manual entries only — the route 409s otherwise).
  const del = useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/settings/ai-knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      toast({ description: "Knowledge entry deleted." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message || "Delete failed" }),
  });
  const confirmDelete = (id: string) => {
    if (!window.confirm("Delete this knowledge entry? Bot will no longer have access to it.")) return;
    del.mutate(id);
  };

  const syncingBackfill = sync.isPending && sync.variables === "backfill";
  const syncingRegulator = sync.isPending && sync.variables === "regulator";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader title="AI Knowledge">
        <p className="text-sm text-muted">
          Every source the AI assistant searches when staff ask questions —
          synced from the dashboard, imported from SharePoint, or pasted and
          uploaded here.
        </p>
      </PageHeader>

      <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/30 p-4 text-sm text-blue-900 dark:text-blue-200 space-y-1">
        <p className="font-semibold">How this works</p>
        <p className="text-xs">
          Handbooks, help articles, centre facts, training modules and policy
          PDFs sync in from where they live; SharePoint policies arrive via
          import. Paste or upload anything else. Only pasted / uploaded entries
          are edited here — everything else can be excluded from search,
          given a tier override, or re-indexed. Updates take effect
          immediately — no re-deploy needed.
        </p>
      </div>

      {/* Library size — confirms sources + chunks are actually there.
          Quick sanity check when the bot says it "can't find" something
          the user just uploaded. */}
      {!isLoading && entries.length > 0 && (() => {
        const active = entries.filter((e) => e.status === "active");
        const indexedCount = active.filter((e) => e.indexedAt !== null).length;
        const totalChunks = active.reduce((s, e) => s + e.chunkCount, 0);
        const errored = entries.filter((e) => e.indexError).length;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card rounded-lg border border-border p-3">
              <p className="text-2xs uppercase tracking-wide text-muted">Sources</p>
              <p className="text-2xl font-bold text-foreground">
                {active.length}
                {active.length !== entries.length && (
                  <span className="text-sm font-normal text-muted"> / {entries.length}</span>
                )}
              </p>
            </div>
            <div className="bg-card rounded-lg border border-border p-3">
              <p className="text-2xs uppercase tracking-wide text-muted">Indexed</p>
              <p className={cn(
                "text-2xl font-bold",
                indexedCount === active.length ? "text-success" : "text-warning",
              )}>
                {indexedCount}/{active.length}
              </p>
            </div>
            <div className="bg-card rounded-lg border border-border p-3">
              <p className="text-2xs uppercase tracking-wide text-muted">Chunks</p>
              <p className="text-2xl font-bold text-foreground">{totalChunks}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-3">
              <p className="text-2xs uppercase tracking-wide text-muted">Errors</p>
              <p className={cn(
                "text-2xl font-bold",
                errored === 0 ? "text-success" : "text-danger",
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => sync.mutate("backfill")}
          loading={syncingBackfill}
          disabled={sync.isPending}
          iconLeft={<RefreshCw className="w-4 h-4" />}
          title="Re-index handbooks, help articles, centre facts, published training modules and current policy PDFs"
        >
          {syncingBackfill ? "Syncing…" : "Sync from dashboard"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => sync.mutate("regulator")}
          loading={syncingRegulator}
          disabled={sync.isPending}
          iconLeft={<Globe className="w-4 h-4" />}
          title="Re-fetch the regulator reference pages (ACECQA, state regulators)"
        >
          {syncingRegulator ? "Refreshing…" : "Refresh regulator refs"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => seedMut.mutate()}
          loading={seedMut.isPending}
          iconLeft={<BookOpen className="w-4 h-4" />}
          title="Re-sync the Employee Handbook sections. Idempotent — unchanged sections are skipped."
        >
          {seedMut.isPending ? "Re-indexing…" : "Re-index handbooks"}
        </Button>
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          loading={uploadMut.isPending}
          iconLeft={<Upload className="w-4 h-4" />}
        >
          {uploadMut.isPending ? "Uploading…" : "Upload PDF / Word"}
        </Button>
        <Button
          size="sm"
          onClick={() => setEditing({ mode: "create" })}
          iconLeft={<Plus className="w-4 h-4" />}
        >
          New entry
        </Button>
      </div>

      <LastSyncPanel />

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-danger">Unable to load entries.</p>
      ) : entries.length === 0 ? (
        <EmptyState onPick={(title) => setEditing({ mode: "create", initialTitle: title })} />
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="Search sources"
              placeholder="Search by title or centre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[12rem] rounded-md border border-border bg-card px-3 py-1.5 text-sm"
            />
            <select
              aria-label="Filter by source kind"
              value={kindFilter}
              onChange={(e) =>
                // Options are "all" plus the KIND_LABEL keys — a string we control.
                setKindFilter(e.target.value as SourceKind | "all")
              }
              className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
            >
              <option value="all">All kinds</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by tier"
              value={tierFilter}
              onChange={(e) =>
                // Options are "all" plus the two Tier values — a string we control.
                setTierFilter(e.target.value as Tier | "all")
              }
              className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
            >
              <option value="all">All tiers</option>
              <option value="safety_critical">Safety-critical</option>
              <option value="general">General</option>
            </select>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) =>
                // Options are exactly the STATUSES list — a string we control.
                setStatusFilter(e.target.value as Status | "all")
              }
              className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted">
            Showing {filtered.length} of {entries.length}
          </p>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted rounded-lg border border-dashed border-border p-6 text-center">
              No sources match these filters.
            </p>
          ) : (
            <ul className="rounded-lg border border-border bg-card overflow-hidden">
              {filtered.map((e) => (
                <KnowledgeSourceRow
                  key={e.id}
                  entry={e}
                  onEdit={(id) => setEditing({ mode: "edit", id })}
                  onDelete={confirmDelete}
                />
              ))}
            </ul>
          )}
        </div>
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
        No knowledge sources yet
      </p>
      <p className="text-xs text-muted mt-1 max-w-md mx-auto">
        Run &ldquo;Sync from dashboard&rdquo; to pull in handbooks, help
        articles and policies, or paste in any plain-text content
        (markdown is fine) to give the AI bot something to draw on.
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
