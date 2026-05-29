"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, Loader2, Eye } from "lucide-react";
import type { Document } from "@prisma/client";
import { FileViewerModal } from "@/components/files/FileViewerModal";
import { toast } from "@/hooks/useToast";

interface DocumentsTabProps {
  documents: Document[];
  /**
   * The staff member whose profile this is. New uploads have their
   * `assignedToId` set to this id so admin-uploaded HR docs surface
   * here instead of disappearing into the org-wide /documents pile.
   */
  targetUserId?: string;
  /** Upload button only renders for admin viewers. */
  isAdmin?: boolean;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DocumentsTab({
  documents,
  targetUserId,
  isAdmin,
}: DocumentsTabProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Shared viewer instance for all document rows. Clicking either the
  // filename or the View action sets `viewing` and the modal renders below.
  const [viewing, setViewing] = useState<Document | null>(null);

  async function handleUpload(file: File) {
    if (!targetUserId) return;
    setUploading(true);
    try {
      // Step 1: upload the file blob.
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const uploaded = (await upRes.json()) as {
        fileName: string;
        fileUrl: string;
        fileSize?: number;
        mimeType?: string;
      };

      // Step 2: create the Document record assigned to this staff
      // member. The /staff/[id] query reads both uploadedById and
      // assignedToId, so this row appears here immediately.
      const docRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name.replace(/\.[^.]+$/, ""),
          category: "hr",
          fileName: uploaded.fileName,
          fileUrl: uploaded.fileUrl,
          fileSize: uploaded.fileSize,
          mimeType: uploaded.mimeType,
          assignedToId: targetUserId,
        }),
      });
      if (!docRes.ok) {
        const err = await docRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save document");
      }

      toast({ description: `Uploaded "${file.name}"` });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Documents</h3>
          {isAdmin && targetUserId && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={onFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-md bg-brand text-white px-3 py-1.5 text-sm hover:bg-brand/90 disabled:opacity-50"
                data-testid="staff-document-upload-button"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload document
              </button>
            </>
          )}
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-muted">No documents uploaded for this staff member.</p>
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="py-3 flex flex-wrap items-center gap-3">
                <FileText className="w-4 h-4 text-muted shrink-0" />
                <div className="flex-1 min-w-[200px]">
                  {/* Title doubles as a clickable affordance per spec. */}
                  <button
                    type="button"
                    onClick={() => setViewing(d)}
                    className="text-sm font-medium text-foreground hover:text-brand hover:underline text-left"
                    data-testid="document-title-button"
                  >
                    {d.title}
                  </button>
                  <div className="text-xs text-muted">
                    {humanize(d.category)} · {formatDate(d.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewing(d)}
                  className="inline-flex items-center gap-1 text-sm text-brand hover:underline shrink-0"
                  data-testid="document-view-button"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewing && (
        <FileViewerModal
          open={!!viewing}
          onClose={() => setViewing(null)}
          title={viewing.title}
          viewerUrl={`/api/staff-documents/${viewing.id}`}
          downloadUrl={`/api/staff-documents/${viewing.id}?download=1`}
          fileName={viewing.fileName ?? viewing.title}
        />
      )}
    </div>
  );
}
