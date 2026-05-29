"use client";

/**
 * FileViewerModal — generic in-app file viewer.
 *
 * Used by every staff-facing and admin-facing file row (Documents,
 * Certifications/Qualifications/Compliance certs, Contracts) so users open
 * a PDF or image inside the dashboard instead of being shoved off to a new
 * browser tab.
 *
 * Render strategy is driven by file extension (sniffed from `fileName` or
 * falling back to the proxy URL path):
 *   - PDF: <iframe src={viewerUrl} /> — browser native PDF viewer
 *   - Image (jpg/jpeg/png/gif/webp/svg): <img src={viewerUrl} />
 *   - Anything else: "Preview not available — Download / Open externally"
 *
 * `viewerUrl` MUST point at an auth-checked proxy (e.g. /api/staff-documents/[id])
 * — never a raw blob URL. The proxy enforces "viewer can see this file"
 * server-side; the iframe/img request hits the same proxy and re-runs the
 * check on every load.
 *
 * Portaled to document.body so position:fixed escapes the dashboard <main>'s
 * animate-slide-up containing block (same fix pattern as the contract
 * viewer modal).
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, ExternalLink, FileQuestion } from "lucide-react";

export interface FileViewerModalProps {
  open: boolean;
  onClose: () => void;
  /** Title shown in the header — typically the filename or a human label. */
  title: string;
  /**
   * URL the iframe/img points at. MUST be an auth-checked proxy
   * (the proxy itself returns 307 → real blob URL or streams the bytes).
   */
  viewerUrl: string;
  /**
   * Optional URL for the Download action in the header. Usually the same
   * proxy with `?download=1` to force `Content-Disposition: attachment`.
   * Omit to hide the Download button (when only inline view makes sense).
   */
  downloadUrl?: string;
  /**
   * Original filename — drives extension-based MIME detection. If absent,
   * the modal falls back to inspecting the viewerUrl's pathname.
   */
  fileName?: string;
}

type RenderKind = "pdf" | "image" | "unknown";

function extensionFromName(name: string | undefined): string {
  if (!name) return "";
  const cleaned = name.split("?")[0].split("#")[0];
  const dot = cleaned.lastIndexOf(".");
  return dot >= 0 ? cleaned.slice(dot + 1).toLowerCase() : "";
}

function detectKind(fileName?: string, fallbackUrl?: string): RenderKind {
  // Prefer fileName, which is the original upload name. Fall back to URL
  // pathname extension — many proxies preserve the .pdf/.jpg suffix in the
  // redirect target.
  const ext =
    extensionFromName(fileName) ||
    extensionFromName(fallbackUrl ? new URL(fallbackUrl, "http://x.local").pathname : "");
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  return "unknown";
}

export function FileViewerModal({
  open,
  onClose,
  title,
  viewerUrl,
  downloadUrl,
  fileName,
}: FileViewerModalProps) {
  const kind = detectKind(fileName, viewerUrl);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      data-testid="file-viewer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        // Same sizing pattern as ContractViewerModal v2: edge-to-edge on
        // mobile; 90vw × 90vh on desktop, capped 1400px for 4K monitors.
        className="bg-card w-full h-full sm:w-[90vw] sm:h-[90vh] sm:max-w-[1400px] flex flex-col shadow-2xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="file-viewer-dialog"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground truncate min-w-0 flex-1">
            {title}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {downloadUrl && (
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-border rounded-md text-foreground hover:bg-surface transition-colors"
                data-testid="file-viewer-download"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 -mr-1.5 rounded-lg hover:bg-surface transition-colors"
              aria-label="Close file viewer"
              data-testid="file-viewer-close"
            >
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden bg-surface flex items-center justify-center">
          {kind === "pdf" && (
            <iframe
              title={title}
              src={viewerUrl}
              className="w-full h-full bg-white border-0"
              data-testid="file-viewer-iframe"
            />
          )}
          {kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewerUrl}
              alt={title}
              className="max-w-full max-h-full object-contain bg-white"
              data-testid="file-viewer-image"
            />
          )}
          {kind === "unknown" && (
            <div
              className="flex flex-col items-center justify-center text-center p-8 gap-3 max-w-md"
              data-testid="file-viewer-fallback"
            >
              <FileQuestion className="w-10 h-10 text-muted/60" />
              <p className="text-sm text-foreground">
                This file type can&apos;t be previewed inside the dashboard.
              </p>
              <div className="flex items-center gap-3">
                <a
                  href={viewerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
                >
                  Open externally <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
