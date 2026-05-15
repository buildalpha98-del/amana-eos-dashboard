"use client";

import { useState, useEffect, useMemo } from "react";
import { CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { toast } from "@/hooks/useToast";
import {
  usePolicies,
  useAcknowledgePolicy,
  type PolicyDocumentListItem,
} from "@/hooks/usePolicies";
import type { PolicyDocumentCategory } from "@prisma/client";

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

export function PolicyStaffPanel() {
  const { data: docs, isLoading } = usePolicies();
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  // Unacknowledged docs first, then alphabetical within each group.
  const sorted = useMemo(() => {
    if (!docs) return [];
    return [...docs].sort((a, b) => {
      const aPending = !a.myAcknowledgedAt;
      const bPending = !b.myAcknowledgedAt;
      if (aPending !== bPending) return aPending ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [docs]);

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

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
        <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          No policies or procedures to review just yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {sorted.map((d) => (
          <StaffRow key={d.id} doc={d} onOpen={() => setOpenDocId(d.id)} />
        ))}
      </ul>
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
            <span className="text-[10px] uppercase tracking-wide font-medium text-muted bg-muted/50 px-1.5 py-0.5 rounded">
              {CATEGORY_LABEL[doc.category]}
            </span>
            {doc.currentVersion && (
              <span className="text-[10px] uppercase tracking-wide font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded">
                v{doc.currentVersion.versionNumber}
              </span>
            )}
          </div>
          {doc.description && (
            <p className="mt-1 text-xs text-muted line-clamp-1">{doc.description}</p>
          )}
        </div>
        {acked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Acknowledged
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">
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
  const [secondsLeft, setSecondsLeft] = useState(
    doc.myAcknowledgedAt ? 0 : READ_DELAY_SECONDS,
  );

  // Countdown — only when the user has not already acknowledged this version.
  useEffect(() => {
    if (doc.myAcknowledgedAt || secondsLeft === 0) return;
    const t = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [doc.myAcknowledgedAt, secondsLeft]);

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
            <iframe
              src={fileSrc}
              title={`${doc.title} PDF`}
              className="flex-1 min-h-0 border-0 bg-muted"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-muted/30">
              <p className="text-sm text-muted">
                This document has no file uploaded yet.
              </p>
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-6 md:py-4">
            {acked ? (
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
              {!acked && (
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
