"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, X } from "lucide-react";
import Link from "next/link";

export type CampaignGateBlocker = {
  serviceId: string;
  serviceName: string;
  lastOpenedAt: string | null;
  lastOpenedBy: string | null;
};

/**
 * Campaign Gate Modal
 *
 * Shown when the user tries to create a campaign against one or more services
 * whose Centre Avatar has not been opened in the last 7 days (or was opened by
 * a different user). Forces a review pass through each Avatar before the
 * campaign can be created.
 *
 * Owner role sees a "Skip gate" affordance — they've explicitly chosen to
 * bypass. Marketing role must open each Avatar.
 */
export function CampaignGateModal({
  open,
  blockers,
  isOwner,
  onClose,
  onSkip,
  onRecheck,
}: {
  open: boolean;
  blockers: CampaignGateBlocker[];
  isOwner: boolean;
  onClose: () => void;
  onSkip: () => void;
  onRecheck?: () => Promise<void> | void;
}) {
  const [rechecking, setRechecking] = useState(false);

  const handleRecheck = async () => {
    if (!onRecheck) return;
    setRechecking(true);
    try {
      await onRecheck();
    } finally {
      setRechecking(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-xl bg-card shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="campaign-gate-title"
        >
          <div className="flex items-start justify-between border-b px-6 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-amber-100 p-1.5 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h2
                  id="campaign-gate-title"
                  className="text-lg font-semibold text-foreground"
                >
                  Review Centre Avatar first
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Open each centre&apos;s Avatar before creating the campaign.
                  Takes ~30 seconds per centre.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
            <p className="mb-3 text-sm text-foreground/80">
              These centres need a fresh Avatar review:
            </p>
            <ul className="space-y-2">
              {blockers.map((b) => (
                <li
                  key={b.serviceId}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface/40 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {b.serviceName}
                    </div>
                    <div className="text-xs text-muted">
                      {b.lastOpenedAt
                        ? `Last opened ${new Date(b.lastOpenedAt).toLocaleDateString()}${b.lastOpenedBy ? ` by ${b.lastOpenedBy}` : ""}`
                        : "Never opened"}
                    </div>
                  </div>
                  <Link
                    href={`/centre-avatars/${b.serviceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              {onRecheck && (
                <button
                  type="button"
                  onClick={handleRecheck}
                  disabled={rechecking}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${rechecking ? "animate-spin" : ""}`} />
                  {rechecking ? "Re-checking..." : "Re-check"}
                </button>
              )}
              {isOwner && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                >
                  Skip gate (owner)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
