"use client";

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ColumnMapping {
  original: string;
  mapped: string;
}

interface PreviewRow {
  rowNumber: number;
  centreName: string;
  matchedService: { id: string; name: string; code: string } | null;
  status: "matched" | "unmatched" | "error";
  data: Record<string, number>;
  periodStart: string | null;
  periodEnd: string | null;
}

interface PreviewData {
  preview: true;
  fileName: string;
  sheetName: string;
  totalRows: number;
  parsedRows: number;
  columnMapping: ColumnMapping[];
  unmappedColumns: string[];
  rows: PreviewRow[];
  matchedCount: number;
  unmatchedCount: number;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: number;
  unmatched: number;
  results: Array<{ centre: string; action: "created" | "updated"; id: string }>;
  importErrors: Array<{ centre: string; error: string }>;
  unmatchedCentres: string[];
}

const FIELD_LABELS: Record<string, string> = {
  centreName: "Centre Name",
  bscRevenue: "BSC Revenue",
  ascRevenue: "ASC Revenue",
  vcRevenue: "VC Revenue",
  otherRevenue: "Other Revenue",
  totalRevenue: "Total Revenue",
  staffCosts: "Staff Costs",
  foodCosts: "Food Costs",
  suppliesCosts: "Supplies Costs",
  rentCosts: "Rent Costs",
  adminCosts: "Admin Costs",
  otherCosts: "Other Costs",
  totalCosts: "Total Costs",
  periodStart: "Period Start",
  periodEnd: "Period End",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

type Step = "upload" | "preview" | "importing" | "result";

export function ImportOWNAModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [periodType, setPeriodType] = useState<"monthly" | "quarterly">("monthly");
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showColumnMapping, setShowColumnMapping] = useState(false);

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setParseError(null);
    setPreview(null);
    setResult(null);
    setLoading(false);
    setShowColumnMapping(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setParseError(null);
      setLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("periodType", periodType);
        formData.append("dryRun", "true");

        const res = await fetch("/api/financials/import", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setParseError(data.error || "Failed to parse file");
          setLoading(false);
          return;
        }

        setPreview(data as PreviewData);
        setStep("preview");
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Failed to parse file");
      } finally {
        setLoading(false);
      }
    },
    [periodType]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleImport = useCallback(async () => {
    if (!file) return;

    setStep("importing");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("periodType", periodType);

      const res = await fetch("/api/financials/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setParseError(data.error || "Import failed");
        setStep("preview");
        setLoading(false);
        return;
      }

      setResult(data as ImportResult);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["financials"] });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Import failed");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }, [file, periodType, queryClient]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-[#004E64]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Import from OWNA</h3>
              <p className="text-xs text-gray-500">
                Upload an Excel or CSV export from OWNA
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Period Type */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">
                  Period Type
                </label>
                <div className="flex gap-2">
                  {(["monthly", "quarterly"] as const).map((pt) => (
                    <button
                      key={pt}
                      onClick={() => setPeriodType(pt)}
                      className={cn(
                        "px-4 py-2 text-sm font-medium rounded-lg border transition-colors",
                        periodType === pt
                          ? "border-[#004E64] bg-[#004E64]/5 text-[#004E64]"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      )}
                    >
                      {pt.charAt(0).toUpperCase() + pt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                  dragOver
                    ? "border-[#004E64] bg-[#004E64]/5"
                    : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-[#004E64] animate-spin" />
                    <p className="text-sm text-gray-600">Parsing file...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">
                      Drop your OWNA export file here
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Supports .xlsx, .xls, and .csv files
                    </p>
                    {file && (
                      <p className="text-xs text-[#004E64] mt-2 font-medium">
                        Selected: {file.name}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Error */}
              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{parseError}</p>
                </div>
              )}

              {/* Expected format help */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                  Expected Columns
                </h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {[
                    "Centre / Service Name",
                    "BSC Revenue",
                    "ASC Revenue",
                    "VC Revenue",
                    "Staff Costs",
                    "Food Costs",
                    "Supplies",
                    "Rent",
                    "Admin Costs",
                    "Other Costs",
                    "Period Start",
                    "Period End",
                  ].map((col) => (
                    <p key={col} className="text-xs text-gray-500 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gray-400" />
                      {col}
                    </p>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Column names are matched flexibly. Most OWNA export formats are supported.
                </p>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === "preview" && preview && (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-[#004E64]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {preview.fileName}
                  </p>
                  <p className="text-xs text-gray-500">
                    Sheet: {preview.sheetName} &middot; {preview.totalRows} rows found &middot;{" "}
                    {preview.parsedRows} data rows parsed
                  </p>
                </div>
              </div>

              {/* Match summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-lg font-bold text-emerald-700">
                      {preview.matchedCount}
                    </p>
                    <p className="text-xs text-emerald-600">Centres matched</p>
                  </div>
                </div>
                {preview.unmatchedCount > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="text-lg font-bold text-amber-700">
                        {preview.unmatchedCount}
                      </p>
                      <p className="text-xs text-amber-600">Centres unmatched</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Column mapping toggle */}
              <button
                onClick={() => setShowColumnMapping(!showColumnMapping)}
                className="flex items-center gap-2 text-sm text-[#004E64] font-medium hover:underline"
              >
                {showColumnMapping ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                Column Mapping ({preview.columnMapping.length} detected)
              </button>

              {showColumnMapping && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  {preview.columnMapping.map((cm) => (
                    <div
                      key={cm.original}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="text-gray-500 font-mono truncate flex-1">
                        {cm.original}
                      </span>
                      <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                      <span className="text-[#004E64] font-medium truncate flex-1">
                        {FIELD_LABELS[cm.mapped] || cm.mapped}
                      </span>
                    </div>
                  ))}
                  {preview.unmappedColumns.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-400 mb-1">
                        Ignored columns: {preview.unmappedColumns.join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Data preview table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Data Preview
                  </h4>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">
                          Status
                        </th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">
                          Centre (File)
                        </th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">
                          Matched To
                        </th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">
                          Revenue
                        </th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">
                          Costs
                        </th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">
                          Profit
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {preview.rows.map((row) => {
                        const totalRev =
                          row.data.totalRevenue ||
                          row.data.bscRevenue +
                            row.data.ascRevenue +
                            row.data.vcRevenue +
                            (row.data.otherRevenue || 0);
                        const totalCost =
                          row.data.totalCosts ||
                          row.data.staffCosts +
                            row.data.foodCosts +
                            row.data.suppliesCosts +
                            row.data.rentCosts +
                            row.data.adminCosts +
                            (row.data.otherCosts || 0);
                        const profit = totalRev - totalCost;

                        return (
                          <tr
                            key={row.rowNumber}
                            className={cn(
                              row.status === "unmatched" && "bg-amber-50/50"
                            )}
                          >
                            <td className="px-3 py-2">
                              {row.status === "matched" ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                              )}
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {row.centreName}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {row.matchedService ? (
                                <span>
                                  {row.matchedService.name}{" "}
                                  <span className="text-gray-400">
                                    ({row.matchedService.code})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-amber-600 italic">
                                  No match found
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {formatCurrency(totalRev)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {formatCurrency(totalCost)}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2 text-right font-medium",
                                profit >= 0 ? "text-emerald-600" : "text-red-600"
                              )}
                            >
                              {formatCurrency(profit)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Error from parse */}
              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{parseError}</p>
                </div>
              )}

              {/* Warning for unmatched */}
              {preview.unmatchedCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      {preview.unmatchedCount} centre(s) could not be matched
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      These rows will be skipped during import. Ensure the centre
                      names in your file match those in the system.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-10 h-10 text-[#004E64] animate-spin" />
              <p className="text-sm text-gray-600">
                Importing financial data...
              </p>
              <p className="text-xs text-gray-400">This may take a moment.</p>
            </div>
          )}

          {/* Step: Result */}
          {step === "result" && result && (
            <div className="space-y-4">
              {/* Success banner */}
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    Import Complete
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Successfully imported data for {result.imported} centre(s).
                  </p>
                </div>
              </div>

              {/* Results summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-600">
                    {result.imported}
                  </p>
                  <p className="text-xs text-gray-500">Imported</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-amber-600">
                    {result.unmatched}
                  </p>
                  <p className="text-xs text-gray-500">Unmatched</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">
                    {result.errors}
                  </p>
                  <p className="text-xs text-gray-500">Errors</p>
                </div>
              </div>

              {/* Imported details */}
              {result.results.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Imported Records
                    </h4>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                    {result.results.map((r, i) => (
                      <div
                        key={i}
                        className="px-4 py-2 flex items-center justify-between"
                      >
                        <span className="text-sm text-gray-900">{r.centre}</span>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            r.action === "created"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {r.action}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched centres */}
              {result.unmatchedCentres.length > 0 && (
                <div className="border border-amber-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                      Unmatched Centres (Skipped)
                    </h4>
                  </div>
                  <div className="divide-y divide-amber-50 max-h-32 overflow-y-auto">
                    {result.unmatchedCentres.map((name, i) => (
                      <div key={i} className="px-4 py-2 text-sm text-amber-800">
                        {name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import errors */}
              {result.importErrors.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-red-50 border-b border-red-200">
                    <h4 className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Errors
                    </h4>
                  </div>
                  <div className="divide-y divide-red-50 max-h-32 overflow-y-auto">
                    {result.importErrors.map((err, i) => (
                      <div key={i} className="px-4 py-2 text-sm text-red-800">
                        <span className="font-medium">{err.centre}:</span>{" "}
                        {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between shrink-0">
          {step === "upload" && (
            <>
              <div />
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={reset}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!preview || preview.matchedCount === 0 || loading}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] disabled:opacity-50 transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Import {preview?.matchedCount || 0} Records
                </button>
              </div>
            </>
          )}

          {step === "importing" && (
            <>
              <div />
              <p className="text-xs text-gray-400">Please wait...</p>
            </>
          )}

          {step === "result" && (
            <>
              <div />
              <button
                onClick={handleClose}
                className="px-5 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
