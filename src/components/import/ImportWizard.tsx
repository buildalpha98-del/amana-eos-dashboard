"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ColumnConfig {
  key: string;
  label: string;
  required?: boolean;
}

interface ImportWizardProps {
  title: string;
  endpoint: string;
  columnConfig: ColumnConfig[];
  onComplete?: () => void;
  onClose: () => void;
}

type Step = "upload" | "preview" | "result";

interface PreviewRow {
  [key: string]: string | number | null;
}

interface DryRunResult {
  valid: number;
  invalid: number;
  warnings: string[];
  errors: string[];
  preview: PreviewRow[];
  columns: string[];
}

interface ExecuteResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export function ImportWizard({
  title,
  endpoint,
  columnConfig,
  onComplete,
  onClose,
}: ImportWizardProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setError(null);
      setLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("mode", "dry-run");

        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to process file");
        }

        const result: DryRunResult = await res.json();
        setDryRunResult(result);
        setStep("preview");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setLoading(false);
      }
    },
    [endpoint]
  );

  const handleExecute = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "execute");

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Import failed");
      }

      const result: ExecuteResult = await res.json();
      setExecuteResult(result);
      setStep("result");
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <div className="flex items-center gap-4 mt-1">
              {(["upload", "preview", "result"] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                      step === s
                        ? "bg-[#004E64] text-white"
                        : i < ["upload", "preview", "result"].indexOf(step)
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-400"
                    )}
                  >
                    {i + 1}
                  </div>
                  <span className="text-xs text-gray-500 capitalize">{s}</span>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
                  loading
                    ? "border-gray-200 bg-gray-50"
                    : "border-gray-300 hover:border-[#004E64] hover:bg-[#004E64]/5"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
                {loading ? (
                  <Loader2 className="w-10 h-10 text-[#004E64] animate-spin mx-auto mb-3" />
                ) : (
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                )}
                <p className="text-sm font-medium text-gray-900">
                  {loading
                    ? "Processing file..."
                    : "Drop your file here or click to browse"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supports CSV, XLSX, XLS
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" />
                  Expected Columns
                </h3>
                <div className="grid grid-cols-2 gap-1">
                  {columnConfig.map((col) => (
                    <div key={col.key} className="text-xs text-gray-600 flex items-center gap-1">
                      <span className={col.required ? "font-semibold" : ""}>
                        {col.label}
                      </span>
                      {col.required && (
                        <span className="text-red-500 text-[10px]">*</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && dryRunResult && (
            <div className="space-y-4">
              {/* Validation summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">
                    {dryRunResult.valid}
                  </p>
                  <p className="text-xs text-emerald-600">Valid Rows</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">
                    {dryRunResult.invalid}
                  </p>
                  <p className="text-xs text-red-600">Invalid Rows</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">
                    {dryRunResult.warnings.length}
                  </p>
                  <p className="text-xs text-amber-600">Warnings</p>
                </div>
              </div>

              {/* Errors */}
              {dryRunResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-700 mb-1">
                    Errors
                  </p>
                  <ul className="text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                    {dryRunResult.errors.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {dryRunResult.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-amber-700 mb-1">
                    Warnings
                  </p>
                  <ul className="text-xs text-amber-600 space-y-0.5 max-h-32 overflow-y-auto">
                    {dryRunResult.warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {dryRunResult.preview.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {dryRunResult.columns.map((col) => (
                            <th
                              key={col}
                              className="text-left px-3 py-2 font-semibold text-gray-600 whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dryRunResult.preview.slice(0, 10).map((row, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-50 hover:bg-gray-50"
                          >
                            {dryRunResult.columns.map((col) => (
                              <td
                                key={col}
                                className="px-3 py-1.5 text-gray-700 whitespace-nowrap"
                              >
                                {row[col] != null ? String(row[col]) : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {dryRunResult.preview.length > 10 && (
                    <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 border-t border-gray-200">
                      Showing 10 of {dryRunResult.preview.length} rows
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Result */}
          {step === "result" && executeResult && (
            <div className="space-y-4 py-8">
              <div className="text-center">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Import Complete
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">
                    {executeResult.created}
                  </p>
                  <p className="text-xs text-emerald-600">Created</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">
                    {executeResult.updated}
                  </p>
                  <p className="text-xs text-blue-600">Updated</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-700">
                    {executeResult.skipped}
                  </p>
                  <p className="text-xs text-gray-600">Skipped</p>
                </div>
              </div>

              {executeResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-w-md mx-auto">
                  <p className="text-sm font-semibold text-red-700 mb-1">
                    Errors
                  </p>
                  <ul className="text-xs text-red-600 space-y-0.5">
                    {executeResult.errors.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div>
            {step === "preview" && (
              <button
                onClick={() => {
                  setStep("upload");
                  setFile(null);
                  setDryRunResult(null);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "preview" && dryRunResult && dryRunResult.valid > 0 && (
              <button
                onClick={handleExecute}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[#004E64] text-white hover:bg-[#003D52] disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Import {dryRunResult.valid} Records
              </button>
            )}
            {step === "result" && (
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[#004E64] text-white hover:bg-[#003D52] transition-colors"
              >
                Done
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
