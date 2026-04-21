"use client";

import { useState, useRef } from "react";
import { Download, Upload, Trash2, Loader2 } from "lucide-react";
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

  const resetModal = () => {
    setFile(null);
    setMode("replace");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    </div>
  );
}
