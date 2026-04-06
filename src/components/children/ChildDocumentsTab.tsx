"use client";

import { useState, useRef } from "react";
import {
  Upload,
  Trash2,
  FileText,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  useChildDocuments,
  useUploadChildDocument,
  useDeleteChildDocument,
  type ChildDocument,
} from "@/hooks/useChildProfile";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";

const DOCUMENT_TYPES = [
  { value: "ANAPHYLAXIS_PLAN", label: "Anaphylaxis Plan" },
  { value: "ASTHMA_PLAN", label: "Asthma Plan" },
  { value: "MEDICAL_CERTIFICATE", label: "Medical Certificate" },
  { value: "IMMUNISATION_RECORD", label: "Immunisation Record" },
  { value: "COURT_ORDER", label: "Court Order" },
  { value: "OTHER", label: "Other" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t.value, t.label]),
);

export function ChildDocumentsTab({ childId }: { childId: string }) {
  const { data, isLoading, error } = useChildDocuments(childId);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChildDocument | null>(null);
  const deleteMutation = useDeleteChildDocument();

  const documents = data?.documents ?? [];

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { childId, documentId: deleteTarget.id },
      { onSuccess: () => setDeleteTarget(null) },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand/90 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents"
          description="Upload medical plans, immunisation records, and other documents."
        />
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">File</th>
                <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Uploaded</th>
                <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">By</th>
                <th className="w-20 px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-surface/50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">
                      {TYPE_LABELS[doc.documentType] ?? doc.documentType}
                    </span>
                    <p className="text-xs text-muted sm:hidden mt-0.5">{doc.fileName}</p>
                  </td>
                  <td className="px-4 py-3 text-muted hidden sm:table-cell truncate max-w-[200px]">
                    {doc.fileName}
                  </td>
                  <td className="px-4 py-3 text-muted hidden sm:table-cell whitespace-nowrap">
                    {new Date(doc.createdAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-muted hidden sm:table-cell">
                    {doc.uploadedBy.name}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded-md text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                        title="Open file"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => setDeleteTarget(doc)}
                        className="p-1 rounded-md text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Dialog */}
      {showUpload && (
        <UploadDocumentDialog childId={childId} onClose={() => setShowUpload(false)} />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <Dialog open onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent size="sm">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Delete Document
            </DialogTitle>
            <p className="text-sm text-muted mt-2">
              Are you sure you want to delete <strong>{deleteTarget.fileName}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function UploadDocumentDialog({
  childId,
  onClose,
}: {
  childId: string;
  onClose: () => void;
}) {
  const uploadMutation = useUploadChildDocument();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !docType) return;
    uploadMutation.mutate(
      { childId, file, documentType: docType },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogTitle className="text-lg font-semibold text-foreground">
          <Upload className="w-5 h-5 inline mr-2 text-brand" />
          Upload Document
        </DialogTitle>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Document Type *</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">Select type...</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">File * (PDF or image, max 10MB)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="w-full text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-border file:text-sm file:font-medium file:bg-surface file:text-foreground hover:file:bg-brand/10 hover:file:text-brand hover:file:border-brand/30 file:transition-colors file:cursor-pointer"
            />
          </div>
          {file && file.size > 10 * 1024 * 1024 && (
            <p className="text-xs text-red-600">File exceeds 10MB limit.</p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadMutation.isPending || !file || !docType || (file?.size ?? 0) > 10 * 1024 * 1024}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
            >
              {uploadMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Upload
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
