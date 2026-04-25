"use client";

import { useState, useRef } from "react";
import { Download, Upload, Trash2, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";

/** Matches Prisma ComplianceCertificate.type */
type CertType =
  | "wwcc"
  | "first_aid"
  | "anaphylaxis"
  | "asthma"
  | "cpr"
  | "police_check"
  | "annual_review"
  | "other"
  | (string & {});

export interface CertActionBarProps {
  cert: {
    id: string;
    serviceId?: string | null;
    fileUrl: string | null;
    fileName: string | null;
    userId: string | null;
    type: CertType;
    issueDate?: Date | string | null;
    expiryDate: Date | string;
  };
  /** Can the viewer upload / replace the cert file? Admin or self. */
  canEdit: boolean;
  /** Can the viewer delete the cert? Admin only. */
  canDelete?: boolean;
  /** Refetch callback — invoked after a successful upload/delete. */
  onUpdated?: () => void;
}

type UploadMode = "replace" | "new_version";

function toDateString(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Action bar for a compliance certificate card.
 *
 * Renders a Download link (when a blob is attached), plus an Upload/Replace
 * button that opens a modal with a file picker and radio choice between
 * "Replace current" and "New version (keeps history)". Admins additionally
 * get a Delete button.
 */
export function CertActionBar({ cert, canEdit, canDelete, onUpdated }: CertActionBarProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<UploadMode>("replace");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Renew modal state — separate from the upload modal so the date pickers
  // don't muddy the file-upload flow.
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewIssue, setRenewIssue] = useState("");
  const [renewExpiry, setRenewExpiry] = useState("");
  const [renewFile, setRenewFile] = useState<File | null>(null);
  const [renewing, setRenewing] = useState(false);
  const renewFileInputRef = useRef<HTMLInputElement>(null);

  const resetModal = () => {
    setFile(null);
    setMode("replace");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetRenewModal = () => {
    setRenewIssue("");
    setRenewExpiry("");
    setRenewFile(null);
    if (renewFileInputRef.current) renewFileInputRef.current.value = "";
  };

  const openRenew = () => {
    // Default the new issue date to today; expiry is left blank because each
    // cert type has a different validity window (WWCC = 5y, First Aid = 3y).
    setRenewIssue(toDateString(new Date()));
    setRenewExpiry("");
    setRenewOpen(true);
  };

  const handleRenew = async () => {
    if (!renewIssue || !renewExpiry) {
      toast({ variant: "destructive", description: "Issue and expiry dates are both required" });
      return;
    }
    if (new Date(renewExpiry) <= new Date(renewIssue)) {
      toast({ variant: "destructive", description: "Expiry must be after issue date" });
      return;
    }
    if (new Date(renewExpiry) <= new Date(cert.expiryDate)) {
      toast({
        variant: "destructive",
        description: "Renewed expiry must be later than the current cert's expiry",
      });
      return;
    }

    setRenewing(true);
    try {
      const data = {
        issueDate: new Date(`${renewIssue}T00:00:00.000Z`).toISOString(),
        expiryDate: new Date(`${renewExpiry}T00:00:00.000Z`).toISOString(),
      };
      let res: Response;
      if (renewFile) {
        const formData = new FormData();
        formData.append("file", renewFile);
        formData.append("data", JSON.stringify(data));
        res = await fetch(`/api/compliance/${cert.id}/renew`, {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch(`/api/compliance/${cert.id}/renew`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Renewal failed (${res.status})`);
      }
      toast({ description: "Certificate renewed" });
      setRenewOpen(false);
      resetRenewModal();
      onUpdated?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ variant: "destructive", description: message });
    } finally {
      setRenewing(false);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast({ variant: "destructive", description: "Please choose a file to upload" });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      if (mode === "replace") {
        // PATCH existing cert — keep dates/type, just swap the file
        formData.append("data", JSON.stringify({}));
        const res = await fetch(`/api/compliance/${cert.id}`, {
          method: "PATCH",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Upload failed (${res.status})`);
        }
      } else {
        // New version — POST a new cert with the same type/service/user and same expiry
        formData.append(
          "data",
          JSON.stringify({
            serviceId: cert.serviceId ?? "",
            userId: cert.userId ?? null,
            type: cert.type,
            issueDate: toDateString(cert.issueDate) || toDateString(new Date()),
            expiryDate: toDateString(cert.expiryDate),
          }),
        );
        const res = await fetch(`/api/compliance`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Upload failed (${res.status})`);
        }
      }

      toast({ description: "Certificate uploaded" });
      setOpen(false);
      resetModal();
      onUpdated?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ variant: "destructive", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this certificate? This cannot be undone.")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/compliance/${cert.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Delete failed (${res.status})`);
      }
      toast({ description: "Certificate deleted" });
      onUpdated?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ variant: "destructive", description: message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      {cert.fileUrl && (
        <a
          href={`/api/compliance/${cert.id}/download`}
          className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
          title={cert.fileName ?? "Download certificate"}
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </a>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground px-2 py-1 rounded-md border border-border hover:bg-surface transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          {cert.fileUrl ? "Replace" : "Upload"}
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={openRenew}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground px-2 py-1 rounded-md border border-border hover:bg-surface transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Renew
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 px-2 py-1 rounded-md border border-border hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Delete
        </button>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetModal();
        }}
      >
        <DialogContent size="md">
          <div className="space-y-4">
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground">
                Upload certificate
              </DialogTitle>
              <DialogDescription className="text-sm text-muted mt-1">
                Choose how the new file should be stored.
              </DialogDescription>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="uploadMode"
                  value="replace"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Replace current</span>
                  <span className="block text-xs text-muted">
                    Swap the file on this certificate. The old blob is removed.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="uploadMode"
                  value="new_version"
                  checked={mode === "new_version"}
                  onChange={() => setMode("new_version")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">New version (keeps history)</span>
                  <span className="block text-xs text-muted">
                    Create a new certificate entry of the same type, preserving the old one.
                  </span>
                </span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-card file:text-foreground hover:file:bg-surface"
              />
              {file && (
                <p className="text-xs text-muted mt-1">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  resetModal();
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                loading={submitting}
                disabled={submitting || !file}
              >
                Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renewOpen}
        onOpenChange={(next) => {
          setRenewOpen(next);
          if (!next) resetRenewModal();
        }}
      >
        <DialogContent size="md">
          <div className="space-y-4">
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground">
                Renew certificate
              </DialogTitle>
              <DialogDescription className="text-sm text-muted mt-1">
                Records a new validity period and links it back to the current
                cert. The current cert is preserved as the predecessor in the
                renewal chain — nothing is lost.
              </DialogDescription>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-muted">
                  New issue date
                </span>
                <input
                  type="date"
                  value={renewIssue}
                  onChange={(e) => setRenewIssue(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-muted">
                  New expiry date
                </span>
                <input
                  type="date"
                  value={renewExpiry}
                  onChange={(e) => setRenewExpiry(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                New certificate file (optional)
              </label>
              <input
                ref={renewFileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                onChange={(e) => setRenewFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-card file:text-foreground hover:file:bg-surface"
              />
              {renewFile && (
                <p className="text-xs text-muted mt-1">
                  {renewFile.name} · {(renewFile.size / 1024).toFixed(0)} KB
                </p>
              )}
              <p className="text-xs text-muted mt-1">
                Leave blank to renew dates only. The previous cert&apos;s file
                stays attached to it for audit history.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRenewOpen(false);
                  resetRenewModal();
                }}
                disabled={renewing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleRenew}
                loading={renewing}
                disabled={renewing || !renewIssue || !renewExpiry}
              >
                Renew
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
