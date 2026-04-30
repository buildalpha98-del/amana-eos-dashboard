"use client";

import { useState, useRef } from "react";
import {
  usePreviewCalendar,
  useImportCalendar,
  type CalendarTemplatePreview,
} from "@/hooks/useAudits";
import {
  Calendar,
  Upload,
  X,
  FileText,
  Check,
  Loader2,
} from "lucide-react";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const freqLabels: Record<string, string> = {
  monthly: "Monthly",
  half_yearly: "Half Yearly",
  yearly: "Yearly",
};

export function UploadCalendarDialog({
  open,
  onClose,
  currentYear,
}: {
  open: boolean;
  onClose: () => void;
  currentYear: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [generateInstances, setGenerateInstances] = useState(true);
  const [year, setYear] = useState(currentYear);
  const [preview, setPreview] = useState<CalendarTemplatePreview[] | null>(null);
  const [result, setResult] = useState<{
    templatesCreated: number;
    templatesUpdated: number;
    instancesCreated: number;
  } | null>(null);

  const previewMutation = usePreviewCalendar();
  const importMutation = useImportCalendar();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setPreview(null);
    setResult(null);

    // Auto-preview
    try {
      const data = await previewMutation.mutateAsync(selected);
      setPreview(data.templates);
    } catch {
      // Error handled by mutation
    }
  };

  const handleImport = async () => {
    if (!file) return;
    try {
      const data = await importMutation.mutateAsync({
        file,
        generateInstances,
        year,
      });
      setResult({
        templatesCreated: data.templatesCreated,
        templatesUpdated: data.templatesUpdated,
        instancesCreated: data.instancesCreated,
      });
    } catch {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand" />
            <h2 className="text-lg font-semibold text-foreground">Upload Compliance Calendar</h2>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-surface">
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Success state */}
          {result ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Calendar Imported Successfully</h3>
              <div className="space-y-1 text-sm text-muted">
                <p>{result.templatesCreated} new template{result.templatesCreated !== 1 ? "s" : ""} created</p>
                <p>{result.templatesUpdated} existing template{result.templatesUpdated !== 1 ? "s" : ""} updated</p>
                {result.instancesCreated > 0 && (
                  <p>{result.instancesCreated} audit instance{result.instancesCreated !== 1 ? "s" : ""} generated for {year}</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* File upload */}
              <div>
                <label className="text-sm font-medium text-foreground/80 block mb-1.5">
                  Compliance Calendar Document
                </label>
                <div
                  className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".docx,.doc,.csv"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-brand" />
                      <span className="text-sm font-medium text-foreground">{file.name}</span>
                      <span className="text-xs text-muted">
                        ({(file.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-muted mx-auto mb-2" />
                      <p className="text-sm text-muted">
                        Click to upload a <strong>.docx</strong> or <strong>.csv</strong> compliance calendar
                      </p>
                      <p className="text-xs text-muted mt-1">Max 10 MB — CSV recommended for most reliable results</p>
                    </>
                  )}
                </div>
                {previewMutation.isError && (
                  <p className="text-sm text-red-600 mt-2">
                    {previewMutation.error?.message || "Failed to parse document"}
                  </p>
                )}
              </div>

              {/* Loading preview */}
              {previewMutation.isPending && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 text-brand animate-spin mr-2" />
                  <span className="text-sm text-muted">Parsing document...</span>
                </div>
              )}

              {/* Preview table */}
              {preview && preview.length > 0 && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">
                      {preview.length} Templates Detected
                    </h3>
                    <div className="border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-surface sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-muted">Name</th>
                            <th className="text-left px-3 py-2 font-medium text-muted w-16">QA</th>
                            <th className="text-left px-3 py-2 font-medium text-muted w-24">Frequency</th>
                            <th className="text-left px-3 py-2 font-medium text-muted w-32">Months</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {preview.map((t, i) => (
                            <tr key={i} className="hover:bg-surface">
                              <td className="px-3 py-2 text-foreground">{t.name}</td>
                              <td className="px-3 py-2 text-muted">QA{t.qualityArea}</td>
                              <td className="px-3 py-2 text-muted">{freqLabels[t.frequency] || t.frequency}</td>
                              <td className="px-3 py-2 text-muted text-xs">
                                {t.scheduledMonths.length === 12
                                  ? "Every month"
                                  : t.scheduledMonths
                                      .map((m) => monthNames[m - 1]?.slice(0, 3))
                                      .join(", ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="flex flex-wrap items-center gap-4 p-4 bg-surface/50 rounded-xl">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={generateInstances}
                        onChange={(e) => setGenerateInstances(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
                      />
                      <span className="text-foreground/80">Generate audit instances for</span>
                    </label>
                    <select
                      value={year}
                      onChange={(e) => setYear(parseInt(e.target.value, 10))}
                      className="px-2 py-1 text-sm border border-border rounded-lg"
                    >
                      {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-surface/50">
          {result ? (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand/90"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-surface"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!preview || preview.length === 0 || importMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {importMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Import Calendar
              </button>
            </>
          )}
          {importMutation.isError && (
            <p className="text-sm text-red-600">
              {importMutation.error?.message || "Import failed"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
