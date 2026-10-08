"use client";

import { useState, useEffect, useMemo } from "react";
import { CheckCircle2, AlertCircle, FileText, ExternalLink, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { toast } from "@/hooks/useToast";
import {
  usePolicies,
  useAcknowledgePolicy,
  type PolicyDocumentListItem,
} from "@/hooks/usePolicies";
import type { PolicyDocumentCategory } from "@prisma/client";
import { PolicyFolderBack, PolicyFolderGrid } from "./PolicyFolders";

const CATEGORY_LABEL: Record<PolicyDocumentCategory, string> = {
  policy: "Policy",
  procedure: "Procedure",
  other: "Other",
};

// How long the user must keep the PDF viewer open before they can acknowledge.
// Matches the spec ("Please read the document — acknowledge available in 5s").
const READ_DELAY_SECONDS = 5;

// ═══════════════════════════════════════════════════════════════════════════
// Staff library — list of docs with status + viewer launcher
// ═══════════════════════════════════════════════════════════════════════════

type Filter = "all" | "to_sign";

const needsSigning = (d: PolicyDocumentListItem) =>
  d.requiresAcknowledgement && !d.myAcknowledgedAt;

export function PolicyStaffPanel({
  stateFilter,
}: {
  /** On a centre's Documents tab: hide the other state's state-only
   *  policies (NSW centre → no "VIC only" documents). */
  stateFilter?: string | null;
} = {}) {
  const { data: allDocs, isLoading, isError, error, refetch } = usePolicies();
  const docs = useMemo(
    () =>
      stateFilter
        ? allDocs?.filter((d) => !d.state || d.state.toUpperCase() === stateFilter.toUpperCase())
        : allDocs,
    [allDocs, stateFilter],
  );
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  // 2026-10-08: the whole SharePoint library lands here (~100 documents),
  // so staff get a search box and filters; only documents marked
  // "requires acknowledgement" ask for a signature.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // 2026-10-09: the library opens on folders; null = the folder grid.
  const [folder, setFolder] = useState<PolicyDocumentCategory | null>(null);

  const toSignCount = useMemo(() => (docs ?? []).filter(needsSigning).length, [docs]);

  // Ones to sign first, then alphabetical.
  const sorted = useMemo(() => {
    if (!docs) return [];
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => (filter === "to_sign" ? needsSigning(d) : true))
      // Searching looks across every folder; otherwise only the open one.
      .filter((d) => q || filter === "to_sign" || !folder || d.category === folder)
      .filter((d) => !q || `${d.title} ${d.description ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const aPending = needsSigning(a);
        const bPending = needsSigning(b);
        if (aPending !== bPending) return aPending ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [docs, query, filter, folder]);
  const showFolders = !query.trim() && filter === "all" && folder === null;

  const openDoc = openDocId ? sorted.find((d) => d.id === openDocId) ?? null : null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // A failed fetch must never look like "nothing to review" — a staff member
  // with unacknowledged policies would be told there are none.
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load policies"
        error={error instanceof Error ? error : null}
        onRetry={() => refetch()}
      />
    );
  }

  if (!docs || docs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
        <FileText className="mx-auto h-8 w-8 text-muted" />
        <p className="mt-3 text-sm text-muted">
          No policies or procedures to review just yet.
        </p>
      </div>
    );
  }

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "Folders" },
    ...(toSignCount ? [{ key: "to_sign" as const, label: `To sign (${toSignCount})` }] : []),
  ];

  return (
    <>
      <div className="space-y-3 mb-3">
        <label className="relative block">
          <span className="sr-only">Search policies and procedures</span>
          <Search className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. sun safe, medication, excursions"
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setFilter(c.key);
                setFolder(null);
              }}
              aria-pressed={filter === c.key}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === c.key
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-card text-muted hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {showFolders ? (
        <PolicyFolderGrid
          docs={docs}
          onOpen={setFolder}
          badge={(inFolder) => {
            const n = inFolder.filter(needsSigning).length;
            return n ? `${n} to sign` : null;
          }}
        />
      ) : sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          {query ? <>Nothing matches “{query}”.</> : "Nothing here."}
        </p>
      ) : (
        <>
        {folder && !query.trim() && filter === "all" && (
          <PolicyFolderBack folder={folder} count={sorted.length} onBack={() => setFolder(null)} />
        )}
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {sorted.map((d) => (
            <StaffRow key={d.id} doc={d} onOpen={() => setOpenDocId(d.id)} />
          ))}
        </ul>
        </>
      )}
      {openDoc && (
        <PolicyViewerModal
          doc={openDoc}
          onClose={() => setOpenDocId(null)}
        />
      )}
    </>
  );
}

// ─── Row ───────────────────────────────────────────────────────

function StaffRow({
  doc,
  onOpen,
}: {
  doc: PolicyDocumentListItem;
  onOpen: () => void;
}) {
  const acked = !!doc.myAcknowledgedAt;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface focus:outline-none focus:ring-2 focus:ring-brand"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">
              {doc.title}
            </span>
            <span className="text-2xs uppercase tracking-wide font-medium text-muted bg-muted/50 px-1.5 py-0.5 rounded">
              {CATEGORY_LABEL[doc.category]}
            </span>
            {doc.state && (
              <span className="text-2xs uppercase tracking-wide font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded">
                {doc.state} only
              </span>
            )}
          </div>
          {doc.description && (
            <p className="mt-1 text-xs text-muted line-clamp-1">{doc.description}</p>
          )}
        </div>
        {!doc.requiresAcknowledgement ? null : acked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2 py-1 text-2xs font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Acknowledged
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-1 text-2xs font-medium text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-3 w-3" />
            Acknowledgement required
          </span>
        )}
      </button>
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Viewer modal — inline PDF + acknowledge flow
// ═══════════════════════════════════════════════════════════════════════════

function PolicyViewerModal({
  doc,
  onClose,
}: {
  doc: PolicyDocumentListItem;
  onClose: () => void;
}) {
  const ack = useAcknowledgePolicy();
  // Reference-only documents (most of the SharePoint library) have no
  // acknowledge step at all.
  const signable = doc.requiresAcknowledgement;
  const [secondsLeft, setSecondsLeft] = useState(
    doc.myAcknowledgedAt || !signable ? 0 : READ_DELAY_SECONDS,
  );

  // Countdown — only when the user has not already acknowledged this version.
  // The interval is created ONCE when the gate starts (not re-created every
  // tick); the functional decrement self-clears at zero.
  useEffect(() => {
    if (doc.myAcknowledgedAt || !signable) return;
    const t = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [doc.myAcknowledgedAt, signable]);

  const acked = !!doc.myAcknowledgedAt;
  const canAck = !acked && secondsLeft === 0;

  async function handleAck() {
    try {
      await ack.mutateAsync(doc.id);
      toast({ description: "Acknowledged successfully" });
      onClose();
    } catch {
      /* toast already fired in the hook */
    }
  }

  // Cache-buster includes the current version id so reopening after a
  // re-upload always fetches the latest PDF (the proxy is the same URL but
  // the file the user sees should match the row's current version).
  const fileSrc = `/api/policies/${doc.id}/file?v=${doc.currentVersion?.id ?? "current"}#toolbar=1&navpanes=0`;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        size="full"
        className="md:max-w-5xl md:p-0"
      >
        <div className="flex h-[80vh] flex-col md:h-[85vh]">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6 md:py-4">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground truncate">
                {doc.title}
              </DialogTitle>
              <p className="text-xs text-muted">
                {CATEGORY_LABEL[doc.category]}
                {doc.currentVersion ? ` · v${doc.currentVersion.versionNumber}` : ""}
              </p>
            </div>
          </header>

          {doc.currentVersion ? (
            <div className="flex flex-1 min-h-0 flex-col">
              {/* iOS Safari renders PDF iframes blank — give mobile users a real way to read the doc. */}
              <div className="border-b border-border bg-surface/50 px-4 py-2 text-right md:px-6">
                <a
                  href={fileSrc}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open PDF in a new tab
                </a>
              </div>
              <iframe
                src={fileSrc}
                title={`${doc.title} PDF`}
                className="flex-1 min-h-0 border-0 bg-muted"
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-muted/30">
              <p className="text-sm text-muted">
                This document has no file uploaded yet.
              </p>
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-6 md:py-4">
            {!signable ? (
              <p className="text-xs text-muted">For reference — no signature needed.</p>
            ) : acked ? (
              <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                You acknowledged this on{" "}
                {new Date(doc.myAcknowledgedAt as string).toLocaleString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            ) : (
              <p className="text-xs text-muted">
                {canAck
                  ? "When you're ready, confirm you've read this document."
                  : `Please read the document — acknowledge available in ${secondsLeft}s`}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-muted"
              >
                Close
              </button>
              {signable && !acked && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleAck}
                  disabled={!canAck || ack.isPending}
                  loading={ack.isPending}
                >
                  {canAck ? "I have read and acknowledge" : `Acknowledge (${secondsLeft}s)`}
                </Button>
              )}
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
