"use client";

import { useRef, useState } from "react";
import type { ProofDecision } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { canUploadProof } from "@/lib/creative-request/proof-rules";
import {
  useDecideProof,
  useRequestProofs,
  useUploadProof,
  type CreativeRequestItem,
} from "@/hooks/useCreativeRequests";

const DECISION_CHIP: Record<ProofDecision, { label: string; className: string }> = {
  approved: {
    label: "Approved",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  approved_with_changes: {
    label: "Approved with changes",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  changes_requested: {
    label: "Changes requested",
    className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};

export function ProofsSection({
  requestId,
  request,
  fulfiller,
  isOwner,
}: {
  requestId: string;
  request: CreativeRequestItem;
  fulfiller: boolean;
  isOwner: boolean;
}) {
  const { data } = useRequestProofs(requestId);
  const uploadProof = useUploadProof();
  const decideProof = useDecideProof();

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [pendingDecision, setPendingDecision] = useState<ProofDecision | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const proofs = data?.proofs ?? [];
  const latest = proofs[0];
  const canDecide =
    request.status === "in_review" && (isOwner || fulfiller) && !!latest && !latest.decision;
  const canSend = fulfiller && canUploadProof(request.status);

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error || "Upload failed");
      }
      const json = (await res.json()) as {
        fileName: string;
        fileUrl: string;
        fileSize: number;
        mimeType: string;
      };
      uploadProof.mutate(
        { id: requestId, ...json, note: note.trim() || undefined },
        { onSuccess: () => setNote("") },
      );
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error && err.message !== "Upload failed"
            ? err.message
            : "File upload failed — try again",
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function submitDecision(decision: ProofDecision) {
    if (!latest) return;
    decideProof.mutate(
      {
        id: requestId,
        proofId: latest.id,
        decision,
        note: decisionNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          setPendingDecision(null);
          setDecisionNote("");
        },
      },
    );
  }

  return (
    <section className="mt-6">
      <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Proofs</h3>
      <div className="space-y-3 mt-2">
        {proofs.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-card border border-border text-muted">
                v{p.version}
              </span>
              <a
                href={p.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-brand-light hover:underline truncate"
              >
                📎 {p.fileName}
              </a>
              {p.decision && (
                <span
                  className={`text-2xs font-semibold rounded px-1.5 py-0.5 ${DECISION_CHIP[p.decision].className}`}
                >
                  {DECISION_CHIP[p.decision].label}
                </span>
              )}
            </div>
            <div className="text-2xs text-muted mt-1">
              {p.uploadedBy?.name ?? "—"} ·{" "}
              {new Date(p.createdAt).toLocaleString("en-AU", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
            {p.note && (
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{p.note}</p>
            )}
            {p.decision && p.decisionNote && (
              <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">
                <span className="text-2xs text-muted">
                  {p.decidedBy?.name ?? "—"}:{" "}
                </span>
                {p.decisionNote}
              </p>
            )}

            {canDecide && p.id === latest.id && (
              <div className="mt-3 border-t border-border pt-3">
                {pendingDecision === null ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => submitDecision("approved")}
                        disabled={decideProof.isPending}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPendingDecision("approved_with_changes")}
                        disabled={decideProof.isPending}
                      >
                        Approve with changes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-600 hover:bg-red-600/8 focus-visible:ring-red-500/50 dark:border-red-500 dark:text-red-400"
                        onClick={() => setPendingDecision("changes_requested")}
                        disabled={decideProof.isPending}
                      >
                        Request changes
                      </Button>
                    </div>
                    <p className="text-2xs text-muted mt-2">
                      Approve with changes = minor fixes, no new proof needed.
                    </p>
                  </>
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      {pendingDecision === "approved_with_changes"
                        ? "What minor fixes are needed?"
                        : "What changes are needed?"}
                      <textarea
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                        rows={2}
                        placeholder="Describe the changes…"
                        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground font-normal"
                      />
                    </label>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() => submitDecision(pendingDecision)}
                        disabled={decideProof.isPending || !decisionNote.trim()}
                      >
                        {pendingDecision === "approved_with_changes"
                          ? "Approve with changes"
                          : "Request changes"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPendingDecision(null);
                          setDecisionNote("");
                        }}
                        disabled={decideProof.isPending}
                      >
                        Back
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {proofs.length === 0 && <p className="text-sm text-muted">No proofs yet.</p>}
      </div>

      {canSend && (
        <div className="mt-3">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
            aria-label="Choose proof file"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional note for the requester…"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
          <div className="flex items-center justify-between gap-3 mt-2">
            <span className="text-2xs text-muted">
              Sending a proof moves the request into review.
            </span>
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={uploading || uploadProof.isPending}
            >
              {uploading || uploadProof.isPending ? "Sending…" : "Send proof for review"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
