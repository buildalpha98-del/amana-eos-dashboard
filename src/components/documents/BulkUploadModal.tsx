"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import {
  Upload,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBulkCreateDocuments } from "@/hooks/useDocuments";
import { toast } from "@/hooks/useToast";
import type { DocumentFolder } from "@/hooks/useDocuments";

const ALLOWED_EXTENSIONS =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp";
const MAX_BULK_FILES = 20;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

const CATEGORIES = [
  "program",
  "policy",
  "procedure",
  "template",
  "guide",
  "compliance",
  "financial",
  "marketing",
  "hr",
  "other",
];

interface Service {
  id: string;
  name: string;
  code: string;
}

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  categories?: string[];
  services: Service[];
  currentFolderId: string | null;
  breadcrumbs: DocumentFolder[];
  bulkCreate: ReturnType<typeof useBulkCreateDocuments>;
  formatFileSize: (bytes: number | null) => string;
}

export function BulkUploadModal({
  open,
  onClose,
  categories = CATEGORIES,
  services,
  currentFolderId,
  breadcrumbs,
  bulkCreate,
  formatFileSize,
}: BulkUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("other");
  const [centreId, setCentreId] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    created: number;
    failed: number;
    failedFiles?: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (selectedFiles.length > MAX_BULK_FILES) {
      errors.push(
        `Maximum ${MAX_BULK_FILES} files allowed. You selected ${selectedFiles.length}.`
      );
    }
    for (const file of selectedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit`);
      }
    }
    return errors;
  }, [selectedFiles]);

  const totalSize = useMemo(
    () => selectedFiles.reduce((sum, f) => sum + f.size, 0),
    [selectedFiles]
  );

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setSelectedFiles((prev) => {
      // Deduplicate by name+size
      const existing = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const unique = arr.filter((f) => !existing.has(`${f.name}:${f.size}`));
      return [...prev, ...unique];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || validationErrors.length > 0) return;

    const fd = new FormData();
    for (const file of selectedFiles) {
      fd.append("files", file);
    }

    const metadata: Record<string, unknown> = {};
    if (category) metadata.category = category;
    if (centreId) metadata.centreId = centreId;
    if (currentFolderId) metadata.folderId = currentFolderId;
    fd.append("metadata", JSON.stringify(metadata));

    try {
      const result = await bulkCreate.mutateAsync(fd);
      setUploadResult({
        created: result.created,
        failed: result.failed,
        failedFiles: result.failedFiles,
      });
      if (result.created > 0) {
        toast({
          description: `${result.created} document${result.created !== 1 ? "s" : ""} uploaded successfully${result.failed > 0 ? ` (${result.failed} failed)` : ""}`,
        });
      }
    } catch (err: any) {
      toast({
        description: err.message || "Bulk upload failed",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setCategory("other");
    setCentreId("");
    setUploadResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Bulk Upload Documents
            </h3>
            <p className="text-sm text-muted mt-0.5">
              Upload multiple files at once
              {currentFolderId && breadcrumbs.length > 0 && (
                <span className="text-brand">
                  {" "}
                  to {breadcrumbs[breadcrumbs.length - 1].name}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {uploadResult ? (
          /* Success summary */
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
              <p className="text-lg font-semibold text-foreground">
                {uploadResult.created} document
                {uploadResult.created !== 1 ? "s" : ""} uploaded
              </p>
              {uploadResult.failed > 0 && (
                <p className="text-sm text-red-600 mt-1">
                  {uploadResult.failed} file
                  {uploadResult.failed !== 1 ? "s" : ""} failed to upload
                  {uploadResult.failedFiles &&
                    uploadResult.failedFiles.length > 0 && (
                      <span className="block text-xs text-muted mt-1">
                        {uploadResult.failedFiles.join(", ")}
                      </span>
                    )}
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="w-full px-4 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Upload form */
          <div className="space-y-4">
            {/* Drag-and-drop zone */}
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1.5">
                Files *
              </label>
              <label
                className={cn(
                  "flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                  isDragOver
                    ? "border-brand bg-brand/10"
                    : "border-border hover:border-brand hover:bg-brand/5"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="w-8 h-8 text-muted" />
                <div className="text-center">
                  <span className="text-sm font-medium text-brand">
                    Click to select files
                  </span>
                  <span className="text-sm text-muted">
                 {" "}
                    or drag and drop
                  </span>
                </div>
                <p className="text-xs text-muted">
                  PDF, Word, Excel, PowerPoint, images up to {MAX_FILE_SIZE_MB}
                  MB each (max {MAX_BULK_FILES} files)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept={ALLOWED_EXTENSIONS}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      addFiles(e.target.files);
                    }
                    // Reset so the same files can be re-selected
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                {validationErrors.map((err, i) => (
                  <p
                    key={i}
                    className="text-xs text-red-600 flex items-center gap-1.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}

            {/* Selected files list */}
            {selectedFiles.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-surface px-3 py-2 flex items-center justify-between border-b border-gray-200">
                  <span className="text-xs font-medium text-muted">
                    {selectedFiles.length} file
                    {selectedFiles.length !== 1 ? "s" : ""} selected
                    <span className="text-muted ml-1">
                      ({formatFileSize(totalSize)})
                    </span>
                  </span>
                  <button
                    onClick={() => setSelectedFiles([])}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Clear all
                  </button>
                </div>
                <ul className="divide-y divide-border/50 max-h-[200px] overflow-y-auto">
                  {selectedFiles.map((file, idx) => (
                    <li
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-surface"
                    >
                      <FileText className="w-4 h-4 text-muted flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      {file.size > MAX_FILE_SIZE && (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <button
                        onClick={() => removeFile(idx)}
                        className="p-1 text-muted/50 hover:text-danger transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metadata fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">
                  Centre (Optional)
                </label>
                <select
                  value={centreId}
                  onChange={(e) => setCentreId(e.target.value)}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                >
                  <option value="">Not centre-specific</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200 mt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={
                  selectedFiles.length === 0 ||
                  validationErrors.length > 0 ||
                  bulkCreate.isPending
                }
                className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {bulkCreate.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload {selectedFiles.length > 0 ? selectedFiles.length : ""}{" "}
                    File
                    {selectedFiles.length !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
