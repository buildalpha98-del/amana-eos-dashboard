"use client";

/**
 * ContractViewerModal — staff-portal inline contract viewer.
 *
 * Renders the contract document inside the dashboard so the staff member can
 * read it AND acknowledge it without ever leaving the app — the new-tab/PDF
 * download flow is too clunky on mobile.
 *
 * Render strategy:
 *   - Template-issued contracts (templateId set): fetch resolved HTML from
 *     /api/contracts/[id]/render and embed via iframe srcDoc.
 *   - Blank-form contracts (no templateId, only a documentUrl PDF): embed
 *     the PDF via iframe src. iOS Safari handles in-iframe PDFs poorly so
 *     we always offer "Open in new tab" as a fallback in the footer.
 *
 * Portaled to document.body so position:fixed escapes the dashboard <main>'s
 * `animate-slide-up` containing block (the bug that caused the original
 * modal cut-off symptom).
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, AlertTriangle, CheckCircle2, ClipboardCheck, ExternalLink, Loader2, FileText } from "lucide-react";
import { toast } from "@/hooks/useToast";

export interface ContractViewerContract {
  id: string;
  contractType: string;
  startDate: string;
  endDate: string | null;
  /** True when the contract has a stored template + values — render via /render. */
  isTemplateBased: boolean;
  /** Baked PDF blob URL. Required for blank-form contracts, optional otherwise (fallback "Open externally" link). */
  documentUrl: string | null;
  /** Has the staff member acknowledged this contract? */
  acknowledged: boolean;
  /** ISO timestamp. Surfaced under the Acknowledged badge when present. */
  acknowledgedAt: string | null;
  /** Only true for an active, not-yet-acknowledged contract. */
  canAcknowledge: boolean;
}

interface Props {
  contract: ContractViewerContract;
  onClose: () => void;
}

function formatContractType(type: string): string {
  return type
    .replace(/^ct_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ContractViewerModal({ contract, onClose }: Props) {
  const qc = useQueryClient();
  const [html, setHtml] = useState<string | null>(null);
  const [htmlError, setHtmlError] = useState<string | null>(null);
  const [loading, setLoading] = useState(contract.isTemplateBased);

  // Fetch the rendered HTML for template-based contracts. Blank-form contracts
  // skip this and go straight to the PDF iframe path.
  useEffect(() => {
    if (!contract.isTemplateBased) return;
    let cancelled = false;
    setLoading(true);
    setHtmlError(null);
    fetch(`/api/contracts/${contract.id}/render`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "You don't have permission to view this contract."
              : "Couldn't load the contract. Try again or open the PDF.",
          );
        }
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setHtml(text);
      })
      .catch((err: Error) => {
        if (!cancelled) setHtmlError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contract.id, contract.isTemplateBased]);

  const acknowledgeMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contracts/${contract.id}/acknowledge`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to sign contract");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Contract signed." });
      qc.invalidateQueries({ queryKey: ["my-portal"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Track whether the acknowledge mutation has succeeded in this open
  // session — flips the footer to "Acknowledged just now" without waiting
  // for the my-portal refetch.
  const justAcknowledged = acknowledgeMut.isSuccess;
  const isAcknowledged = contract.acknowledged || justAcknowledged;

  // The /render endpoint returns A4-styled HTML (margin: 2cm) suitable for
  // the PDF path. Inside a modal that's ~1260px wide on desktop / 375px on
  // mobile, those margins produce either a too-wide text column or a too-
  // cramped one. Inject a viewer-only stylesheet (idempotent — only the
  // modal sees it, the PDF path is unchanged) that caps the column at 78ch
  // and tightens padding/font on narrow viewports.
  const styledHtml = useMemo(() => {
    if (!html) return html;
    const injection = `<style>
      html, body { height: auto; }
      body {
        max-width: 78ch;
        margin: 2cm auto !important;
        padding: 0 1rem;
        box-sizing: border-box;
      }
      @media (max-width: 600px) {
        body {
          margin: 1.25rem auto !important;
          padding: 0 0.75rem;
          font-size: 14pt;
        }
        h1, h2, h3 { line-height: 1.2; }
      }
    </style>`;
    // Prefer to slot the injection right before </head> so it overrides the
    // base styles emitted by renderTemplateHtml. Fall back to prepending it
    // if the HTML shape ever changes.
    return html.includes("</head>")
      ? html.replace("</head>", `${injection}</head>`)
      : `${injection}${html}`;
  }, [html]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      data-testid="contract-viewer-overlay"
      onClick={(e) => {
        // Close when clicking the backdrop, but not when clicking inside.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        // Sizing — these contracts are full staff handbooks; readers need
        // real estate, not a card. On desktop we lock to 90% of the viewport
        // on both axes (the inner srcDoc gets its own centered text column
        // for line-length comfort, see styledHtml below). The 1400px cap
        // keeps things sensible on 4K monitors. On mobile we stay edge-to-
        // edge so the sticky footer hugs the iPhone safe area.
        className="bg-card w-full h-full sm:w-[90vw] sm:h-[90vh] sm:max-w-[1400px] flex flex-col shadow-2xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-viewer-title"
        data-testid="contract-viewer-dialog"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand shrink-0" />
            <div className="min-w-0">
              <h2
                id="contract-viewer-title"
                className="text-base font-semibold text-foreground truncate"
              >
                {formatContractType(contract.contractType)} contract
              </h2>
              <p className="text-xs text-muted truncate">
                {formatDate(contract.startDate)}
                {contract.endDate && ` – ${formatDate(contract.endDate)}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface transition-colors shrink-0"
            aria-label="Close contract viewer"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden bg-surface">
          {loading && (
            <div className="h-full flex items-center justify-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading contract…
            </div>
          )}

          {!loading && htmlError && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-3">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <p className="text-sm text-foreground max-w-md">{htmlError}</p>
              {contract.documentUrl && (
                <a
                  href={contract.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
                >
                  Open PDF instead <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {!loading && !htmlError && contract.isTemplateBased && styledHtml && (
            <iframe
              title="Contract content"
              srcDoc={styledHtml}
              sandbox="allow-same-origin"
              className="w-full h-full bg-white border-0"
              data-testid="contract-viewer-iframe"
            />
          )}

          {!loading && !contract.isTemplateBased && contract.documentUrl && (
            <iframe
              title="Contract PDF"
              src={contract.documentUrl}
              className="w-full h-full bg-white border-0"
              data-testid="contract-viewer-iframe"
            />
          )}

          {!loading && !contract.isTemplateBased && !contract.documentUrl && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-2 text-muted">
              <AlertTriangle className="w-8 h-8 text-muted/60" />
              <p className="text-sm">No document is attached to this contract.</p>
            </div>
          )}
        </div>

        {/* Sticky footer — Acknowledge button (when applicable) + fallbacks. */}
        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-3 text-xs text-muted">
            {isAcknowledged ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {justAcknowledged
                  ? "Signed just now"
                  : `Signed${contract.acknowledgedAt ? ` on ${formatDate(contract.acknowledgedAt)}` : ""}`}
              </span>
            ) : contract.canAcknowledge ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Action required
              </span>
            ) : null}

            {contract.documentUrl && (
              <a
                href={contract.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-muted hover:text-foreground"
              >
                Open in new tab <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {contract.canAcknowledge && !isAcknowledged && (
            <button
              type="button"
              onClick={() => acknowledgeMut.mutate()}
              disabled={acknowledgeMut.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
              data-testid="contract-viewer-acknowledge"
            >
              {acknowledgeMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ClipboardCheck className="w-4 h-4" />
              )}
              {acknowledgeMut.isPending ? "Signing…" : "Sign Contract"}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
