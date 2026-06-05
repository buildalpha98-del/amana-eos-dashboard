"use client";

/**
 * Drag-and-drop "drop a PDF here" zone used on the staff profile's
 * Latest Contract card. Lets admins backfill existing off-platform
 * contracts (EH-era PDFs, scanned hard copies, etc.) without
 * retyping any of the metadata that's already in the document.
 *
 * Posts to /api/contracts/quick-upload (multipart). On success
 * refreshes the route so the Latest Contract card re-fetches and
 * shows the just-attached PDF, and the /team yellow "no contract"
 * badge clears next time that page loads.
 *
 * 2026-06-04.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, AlertCircle, Check } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  /** Optional — shown in the success toast. */
  userName?: string;
}

export function ContractQuickUpload({ userId, userName }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track the most recent uploaded filename so we can briefly show a
  // success state before the route.refresh() loads the new contract.
  const [lastUploaded, setLastUploaded] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("PDF files only");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("PDF too large (max 10 MB)");
      return;
    }
    if (file.size === 0) {
      setError("File is empty");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("file", file);
      // Raw fetch (not fetchApi) — FormData uploads bypass JSON
      // content-type handling. Same pattern as ContractFormFields.
      const res = await fetch("/api/contracts/quick-upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: "Upload failed" }));
        throw new Error(body.error ?? "Upload failed");
      }
      setLastUploaded(file.name);
      toast({
        description: userName
          ? `Contract attached to ${userName}.`
          : "Contract attached.",
      });
      // Refresh the server component so the Latest Contract card
      // re-renders with the newly-attached PDF.
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed";
      setError(message);
      toast({ variant: "destructive", description: message });
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!uploading) setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleClick() {
    if (uploading) return;
    fileInputRef.current?.click();
  }

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    // Keyboard-accessible: Enter / Space opens the file picker.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    // Reset so the same file can be picked again if the user wants
    // to retry after a failure.
    e.target.value = "";
  }

  return (
    <div
      role="button"
      tabIndex={uploading ? -1 : 0}
      aria-label="Drop a signed contract PDF here, or click to choose a file"
      data-testid="contract-quick-upload-dropzone"
      onClick={handleClick}
      onKeyDown={handleKey}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
        "focus:outline-none focus:ring-2 focus:ring-brand/40",
        uploading && "opacity-70 cursor-wait",
        dragging
          ? "border-brand bg-brand/5"
          : "border-border bg-surface/40 hover:bg-surface/70",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileInput}
        disabled={uploading}
        className="sr-only"
        aria-hidden="true"
      />
      <div className="flex flex-col items-center gap-2">
        {uploading ? (
          <>
            <Loader2 className="h-6 w-6 text-brand animate-spin" />
            <p className="text-sm font-medium text-foreground">
              Uploading…
            </p>
          </>
        ) : lastUploaded ? (
          <>
            <Check className="h-6 w-6 text-emerald-600" />
            <p className="text-sm font-medium text-foreground">
              Attached <span className="font-mono">{lastUploaded}</span>
            </p>
            <p className="text-xs text-muted">
              Drop another to replace, or refresh to see it on the card above.
            </p>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted" />
            <p className="text-sm font-medium text-foreground">
              Drop a signed contract PDF here
            </p>
            <p className="text-xs text-muted">
              or click to choose a file · max 10 MB
            </p>
            <p className="text-[11px] text-muted/80 mt-1 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              No metadata required — everything stays inside the PDF.
            </p>
          </>
        )}
      </div>
      {error && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
    </div>
  );
}
