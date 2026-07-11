"use client";

/**
 * StaffCertUploadModal — guided cert upload for the staff portal's
 * `/compliance` page (StaffComplianceView).
 *
 * Replaces the previous "click Upload, OS file picker opens, file silently
 * uploads with today+1y expiry" flow. The old flow had no way to capture
 * the real expiry, so every uploaded cert ended up with a bogus date. This
 * modal captures three pieces of intent up front:
 *
 *   - The file itself
 *   - Whether the cert has an expiry (Yes/No)
 *   - The expiry date (if Yes), min-today
 *
 * Submit is disabled until all required pieces are filled in. The actual
 * upload + create/PATCH happens in the parent (StaffComplianceView), which
 * has the cert-list context needed to decide attach-vs-create.
 *
 * Portaled to document.body so position:fixed escapes <main>'s
 * containing-block trap (same pattern as ContractViewerModal /
 * FileViewerModal).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Upload, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface StaffCertUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** Human label for the cert type being uploaded, e.g. "WWCC" or "First Aid". */
  typeLabel: string;
  /** Async callback invoked when the user submits. Returns when the parent has
   *  finished the upload + cert write so the modal can show a spinner during. */
  onSubmit: (args: { file: File; expiryDate: string | null }) => Promise<void>;
}

function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function StaffCertUploadModal({
  open,
  onClose,
  typeLabel,
  onSubmit,
}: StaffCertUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [hasExpiry, setHasExpiry] = useState<"yes" | "no" | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the modal opens so leftover values from a prior
  // open don't carry across cert types.
  useEffect(() => {
    if (open) {
      setFile(null);
      setHasExpiry(null);
      setExpiryDate("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  // Escape closes (unless submitting — don't lose the in-flight upload).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const minDate = todayIso();
  const canSubmit =
    !!file &&
    hasExpiry !== null &&
    (hasExpiry === "no" || (hasExpiry === "yes" && expiryDate >= minDate)) &&
    !submitting;

  async function handleSubmit() {
    if (!file || hasExpiry === null) return;
    if (hasExpiry === "yes" && !expiryDate) {
      setError("Pick an expiry date — or switch to 'No expiry'.");
      return;
    }
    if (hasExpiry === "yes" && expiryDate < minDate) {
      setError("Expiry date can't be in the past — pick today or later.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        file,
        expiryDate: hasExpiry === "yes" ? expiryDate : null,
      });
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed. Try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      data-testid="staff-cert-upload-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg flex flex-col shadow-2xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-cert-upload-title"
        data-testid="staff-cert-upload-dialog"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2
            id="staff-cert-upload-title"
            className="text-base font-semibold text-foreground truncate"
          >
            Upload {typeLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
            aria-label="Close upload dialog"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* File picker */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Document
            </label>
            <label
              htmlFor="staff-cert-upload-file"
              className="flex items-center gap-3 px-3 py-2.5 border border-dashed border-border rounded-lg cursor-pointer hover:bg-surface transition-colors"
            >
              <FileText className="w-4 h-4 text-muted" />
              <span className="text-sm text-foreground/80 truncate">
                {file ? file.name : "Choose a file…"}
              </span>
              <input
                id="staff-cert-upload-file"
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.tif,.tiff,.bmp,image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={submitting}
                data-testid="staff-cert-upload-file-input"
              />
            </label>
          </div>

          {/* Expiry toggle */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Does this document have an expiry date?
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="staff-cert-has-expiry"
                  value="yes"
                  checked={hasExpiry === "yes"}
                  onChange={() => setHasExpiry("yes")}
                  disabled={submitting}
                  className="mt-0.5"
                  data-testid="staff-cert-upload-expiry-yes"
                />
                <span>
                  <span className="font-medium">Yes</span>
                  <span className="block text-xs text-muted">
                    Pick the date the certificate expires on.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="staff-cert-has-expiry"
                  value="no"
                  checked={hasExpiry === "no"}
                  onChange={() => setHasExpiry("no")}
                  disabled={submitting}
                  className="mt-0.5"
                  data-testid="staff-cert-upload-expiry-no"
                />
                <span>
                  <span className="font-medium">No expiry</span>
                  <span className="block text-xs text-muted">
                    The certificate doesn&apos;t expire (e.g. lifetime
                    qualification, induction confirmation).
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Date picker — only shown when "Yes" */}
          {hasExpiry === "yes" && (
            <div>
              <label
                htmlFor="staff-cert-upload-expiry-date"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Expiry date
              </label>
              <input
                id="staff-cert-upload-expiry-date"
                type="date"
                value={expiryDate}
                min={minDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                disabled={submitting}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                data-testid="staff-cert-upload-expiry-date-input"
              />
              <p className="mt-1 text-xs text-muted">
                Must be today or later. Picker opens at today&apos;s date.
              </p>
            </div>
          )}

          {error && (
            <div
              className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
              data-testid="staff-cert-upload-error"
            >
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-end gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            iconLeft={<Upload className="w-4 h-4" />}
            data-testid="staff-cert-upload-submit"
          >
            {submitting ? "Uploading…" : "Upload"}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
