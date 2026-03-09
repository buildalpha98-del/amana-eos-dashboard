"use client";

import { useState, useRef, useCallback } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import {
  useImportCalendarPreview,
  useImportCalendar,
  type ImportPreviewData,
  type ImportResultData,
} from "@/hooks/useMarketing";
import { PlatformBadge } from "./PlatformBadge";
import { StatusBadge } from "./StatusBadge";

interface ImportCalendarModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = "upload" | "preview" | "success";

export function ImportCalendarModal({
  open,
  onClose,
}: ImportCalendarModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ImportPreviewData | null>(
    null
  );
  const [importResult, setImportResult] = useState<ImportResultData | null>(
    null
  );
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");

  const previewMutation = useImportCalendarPreview();
  const importMutation = useImportCalendar();

  const resetState = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    setPreviewData(null);
    setImportResult(null);
    setDragActive(false);
    setError("");
  }, []);

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleFileSelect(file: File) {
    setError("");
    setSelectedFile(file);

    try {
      const result = await previewMutation.mutateAsync(file);
      setPreviewData(result);
      setStep("preview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to parse file."
      );
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  async function handleImport() {
    if (!selectedFile) return;
    setError("");

    try {
      const result = await importMutation.mutateAsync(selectedFile);
      setImportResult(result);
      setStep("success");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import calendar."
      );
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-4xl rounded-xl bg-white shadow-xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
            <div className="flex items-center gap-3">
              {step === "preview" && (
                <button
                  onClick={() => {
                    setStep("upload");
                    setSelectedFile(null);
                    setPreviewData(null);
                    setError("");
                  }}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <FileSpreadsheet className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold text-gray-900">
                {step === "upload" && "Import Content Calendar"}
                {step === "preview" && "Preview Import"}
                {step === "success" && "Import Complete"}
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* ── Step 1: Upload ───────────────────────── */}
            {step === "upload" && (
              <div className="space-y-6">
                {/* Drop Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
                    dragActive
                      ? "border-brand bg-brand/5"
                      : "border-gray-300 hover:border-brand hover:bg-gray-50"
                  }`}
                >
                  {previewMutation.isPending ? (
                    <>
                      <Loader2 className="h-10 w-10 text-brand animate-spin mb-3" />
                      <p className="text-sm font-medium text-gray-700">
                        Parsing file...
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-gray-400 mb-3" />
                      <p className="text-sm font-medium text-gray-700">
                        Drag & drop your content calendar here
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        or click to browse. Supports CSV, XLSX, XLS files
                      </p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleInputChange}
                    className="hidden"
                  />
                </div>

                {/* Expected Columns */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Expected Columns
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Your file should include these columns (flexible naming
                    supported):
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
                    {[
                      { name: "Date", required: false, desc: "Scheduled date" },
                      { name: "Platform", required: true, desc: "Facebook, Instagram, etc." },
                      { name: "Content / Caption", required: false, desc: "Post copy" },
                      { name: "Title", required: false, desc: "Post title" },
                      { name: "Campaign Name", required: false, desc: "Groups posts" },
                      { name: "Status", required: false, desc: "Draft, Scheduled, etc." },
                      { name: "Post Type / Pillar", required: false, desc: "Content category" },
                      { name: "Hashtags", required: false, desc: "Tags for the post" },
                    ].map((col) => (
                      <div key={col.name} className="flex items-start gap-1.5">
                        <div
                          className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                            col.required ? "bg-red-400" : "bg-gray-400"
                          }`}
                        />
                        <div>
                          <span className="text-xs font-medium text-gray-700">
                            {col.name}
                            {col.required && (
                              <span className="text-red-500 ml-0.5">*</span>
                            )}
                          </span>
                          <p className="text-xs text-gray-400">{col.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Preview ──────────────────────── */}
            {step === "preview" && previewData && (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-sm">
                    <span className="font-medium text-gray-700">File:</span>{" "}
                    <span className="text-gray-600">
                      {selectedFile?.name}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-gray-300" />
                  <div className="text-sm">
                    <span className="font-semibold text-brand">
                      {previewData.summary.validPosts}
                    </span>{" "}
                    <span className="text-gray-600">posts ready</span>
                  </div>
                  {previewData.summary.campaigns.length > 0 && (
                    <>
                      <div className="h-4 w-px bg-gray-300" />
                      <div className="text-sm">
                        <span className="font-semibold text-brand">
                          {previewData.summary.campaigns.length}
                        </span>{" "}
                        <span className="text-gray-600">
                          campaign{previewData.summary.campaigns.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </>
                  )}
                  {previewData.summary.errorCount > 0 && (
                    <>
                      <div className="h-4 w-px bg-gray-300" />
                      <div className="text-sm">
                        <span className="font-semibold text-amber-600">
                          {previewData.summary.errorCount}
                        </span>{" "}
                        <span className="text-gray-600">
                          row{previewData.summary.errorCount !== 1 ? "s" : ""}{" "}
                          skipped
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Error rows */}
                {previewData.errors.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-800">
                        Skipped Rows
                      </span>
                    </div>
                    <div className="space-y-1">
                      {previewData.errors.map((err, i) => (
                        <p key={i} className="text-xs text-amber-700">
                          Row {err.row}: {err.message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Campaign summary chips */}
                {previewData.summary.campaigns.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs font-medium text-gray-500 self-center">
                      Campaigns:
                    </span>
                    {previewData.summary.campaigns.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Data table */}
                {previewData.posts.length > 0 && (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            <th className="px-3 py-2.5 w-8">#</th>
                            <th className="px-3 py-2.5">Title</th>
                            <th className="px-3 py-2.5">Platform</th>
                            <th className="px-3 py-2.5">Date</th>
                            <th className="px-3 py-2.5">Status</th>
                            <th className="px-3 py-2.5">Campaign</th>
                            <th className="px-3 py-2.5 min-w-[200px]">
                              Content Preview
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {previewData.posts.map((post, idx) => (
                            <tr
                              key={idx}
                              className="hover:bg-gray-50 transition-colors"
                            >
                              <td className="px-3 py-2.5 text-gray-400 text-xs">
                                {post.rowIndex}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[180px] truncate">
                                {post.title}
                              </td>
                              <td className="px-3 py-2.5">
                                <PlatformBadge platform={post.platform} />
                              </td>
                              <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                                {formatDate(post.scheduledDate)}
                              </td>
                              <td className="px-3 py-2.5">
                                <StatusBadge
                                  status={post.status}
                                  type="post"
                                />
                              </td>
                              <td className="px-3 py-2.5 text-gray-600">
                                {post.campaign ?? "\u2014"}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 max-w-[240px] truncate">
                                {post.content
                                  ? post.content.substring(0, 80) +
                                    (post.content.length > 80 ? "..." : "")
                                  : "\u2014"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Success ──────────────────────── */}
            {step === "success" && importResult && (
              <div className="flex flex-col items-center py-8 space-y-4">
                <div className="rounded-full bg-emerald-100 p-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Import Successful
                </h3>
                <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-brand">
                      {importResult.summary.postsCreated}
                    </div>
                    <div>
                      post{importResult.summary.postsCreated !== 1 ? "s" : ""}{" "}
                      created
                    </div>
                  </div>
                  <div className="h-10 w-px bg-gray-200" />
                  <div className="text-center">
                    <div className="text-2xl font-bold text-brand">
                      {importResult.summary.campaignsMatched}
                    </div>
                    <div>
                      campaign
                      {importResult.summary.campaignsMatched !== 1
                        ? "s"
                        : ""}{" "}
                      linked
                    </div>
                  </div>
                  {importResult.summary.errors > 0 && (
                    <>
                      <div className="h-10 w-px bg-gray-200" />
                      <div className="text-center">
                        <div className="text-2xl font-bold text-amber-600">
                          {importResult.summary.errors}
                        </div>
                        <div>rows skipped</div>
                      </div>
                    </>
                  )}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mt-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-800">
                        Skipped Rows
                      </span>
                    </div>
                    <div className="space-y-1">
                      {importResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-amber-700">
                          Row {err.row}: {err.message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 shrink-0">
            {step === "upload" && (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}

            {step === "preview" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setStep("upload");
                    setSelectedFile(null);
                    setPreviewData(null);
                    setError("");
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Choose Different File
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={
                    importMutation.isPending ||
                    !previewData ||
                    previewData.posts.length === 0
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Import {previewData?.summary.validPosts ?? 0} Posts
                    </>
                  )}
                </button>
              </>
            )}

            {step === "success" && (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
