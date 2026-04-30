"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { ParentAvatar } from "@/lib/centre-avatar/sections";
import { ParentAvatarReadonlyPreview } from "./SectionReadonlyPreview";

/**
 * AI parent-avatar generation modal.
 *
 * Click "Generate" → calls POST /api/centre-avatars/:id/generate-parent-avatar
 * with the centre's existing snapshot. Shows the proposed avatar inline.
 * Apply commits via the existing PATCH section route. Discard closes.
 */
export function AiGenerateModal({
  open,
  onClose,
  serviceId,
  centreName,
  onApply,
  isApplying,
}: {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  centreName: string;
  onApply: (proposed: Record<string, unknown>) => Promise<void>;
  isApplying: boolean;
}) {
  const [proposed, setProposed] = useState<ParentAvatar | null>(null);
  const [meta, setMeta] = useState<{
    cached: boolean;
    provider: string;
    modelId: string;
    costUsd: number;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const result = await mutateApi<{
        avatar: ParentAvatar;
        cached: boolean;
        provider: string;
        modelId: string;
        costUsd: number;
      }>(
        `/api/centre-avatars/${serviceId}/generate-parent-avatar`,
        { method: "POST" },
      );
      setProposed(result.avatar);
      setMeta({
        cached: result.cached,
        provider: result.provider,
        modelId: result.modelId,
        costUsd: result.costUsd,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setError(msg);
      toast({ variant: "destructive", description: msg });
    } finally {
      setGenerating(false);
    }
  };

  const apply = async () => {
    if (!proposed) return;
    await onApply(proposed as Record<string, unknown>);
    handleClose();
  };

  const handleClose = () => {
    setProposed(null);
    setMeta(null);
    setError(null);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
          className="flex w-full max-w-3xl flex-col rounded-xl bg-card shadow-xl"
          style={{ maxHeight: "90vh" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="ai-modal-title"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border px-6 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-brand/10 p-1.5 text-brand">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 id="ai-modal-title" className="text-lg font-semibold text-foreground">
                  Draft parent avatar with AI
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {centreName} · uses your current snapshot to draft a proposed avatar.
                  You review, you commit.
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {!proposed && !generating && !error && (
              <div className="rounded-lg border border-dashed border-border bg-surface/30 px-5 py-8 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-brand" />
                <p className="mt-2 text-sm text-foreground">
                  Click <strong>Generate</strong> to have AI draft a parent avatar from this
                  centre&apos;s snapshot. Limit: 5 generations per day.
                </p>
                <p className="mt-1 text-xs text-muted">
                  This drafts; it doesn&apos;t commit. You review the output before applying.
                </p>
              </div>
            )}

            {generating && (
              <div className="flex flex-col items-center justify-center rounded-lg bg-surface/30 py-10">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
                <p className="mt-2 text-sm">Drafting…</p>
                <p className="text-xs text-muted">Usually takes 5–10 seconds.</p>
              </div>
            )}

            {error && !generating && (
              <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <p className="font-medium">Generation failed</p>
                <p className="mt-1">{error}</p>
              </div>
            )}

            {proposed && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  {meta?.cached && (
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-blue-700">
                      cached (24h reuse)
                    </span>
                  )}
                  {meta && (
                    <>
                      <span className="rounded-md bg-surface px-2 py-0.5">
                        {meta.provider} · {meta.modelId}
                      </span>
                      {meta.costUsd > 0 && (
                        <span className="text-muted">
                          ~${meta.costUsd.toFixed(4)}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <ParentAvatarReadonlyPreview value={proposed} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface"
            >
              {proposed ? "Discard" : "Cancel"}
            </button>
            <div className="flex items-center gap-2">
              {!proposed ? (
                <button
                  type="button"
                  onClick={generate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generating ? "Drafting..." : "Generate"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={generate}
                    disabled={generating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-surface disabled:opacity-50"
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={apply}
                    disabled={isApplying}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                  >
                    {isApplying && <Loader2 className="h-4 w-4 animate-spin" />}
                    Apply to Avatar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
