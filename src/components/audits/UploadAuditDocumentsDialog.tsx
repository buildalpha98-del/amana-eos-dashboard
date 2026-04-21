"use client";

import { useState, useRef } from "react";
import {
  useAuditTemplates,
  useBulkParseAudit,
  useBulkSaveAuditItems,
  type BulkParseResult,
} from "@/hooks/useAudits";
import { toast } from "@/hooks/useToast";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Upload,
  X,
  FileText,
  Check,
  AlertCircle,
  FileUp,
} from "lucide-react";

type ParseRow = BulkParseResult["results"][number] & {
  /** User may override the auto-matched template */
  overrideTemplateId: string | null;
};

export function UploadAuditDocumentsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const filesRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ParseRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const parseMutation = useBulkParseAudit();
  const saveMutation = useBulkSaveAuditItems();

  // Fetch all templates for the manual reassign dropdown
  const { data: templates = [] } = useAuditTemplates();

  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setFiles(selected);
    setRows([]);
    setSaved(false);

    try {
      const data = await parseMutation.mutateAsync(selected);
      setRows(
        data.results.map((r) => ({
          ...r,
          overrideTemplateId: null,
        })),
      );
    } catch {
      // Error handled by mutation onError
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) =>
        f.name.endsWith(".docx") ||
        f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    if (dropped.length === 0) return;
    setFiles(dropped);
    setRows([]);
    setSaved(false);

    try {
      const data = await parseMutation.mutateAsync(dropped);
      setRows(
        data.results.map((r) => ({
          ...r,
          overrideTemplateId: null,
        })),
      );
    } catch {
      // Error handled by mutation onError
    }
  };

  const getEffectiveTemplateId = (row: ParseRow) =>
    row.overrideTemplateId ?? row.match.templateId;

  const savableRows = rows.filter(
    (r) => !r.error && r.parsed && getEffectiveTemplateId(r),
  );

  const handleSave = async () => {
    if (savableRows.length === 0) return;

    const payload = {
      templates: savableRows.map((r) => ({
        templateId: getEffectiveTemplateId(r)!,
        responseFormat: r.parsed!.detectedFormat,
        items: r.parsed!.items,
      })),
    };

    try {
      const result = await saveMutation.mutateAsync(payload);
      setSaved(true);
      setSavedCount(result.results.length);
      toast({ description: `Saved questions for ${result.results.length} audit templates` });
    } catch {
      // Error handled by mutation onError
    }
  };

  const handleClose = () => {
    setFiles([]);
    setRows([]);
    setSaved(false);
    setSavedCount(0);
    if (filesRef.current) filesRef.current.value = "";
    onClose();
  };

  const handleOverride = (idx: number, templateId: string) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, overrideTemplateId: templateId || null } : r,
      ),
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileUp className="w-5 h-5 text-brand" />
            <h2 className="text-lg font-semibold text-foreground">Upload Audit Documents</h2>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-surface">
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {saved ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Audit Questions Saved
              </h3>
              <p className="text-sm text-muted">
                Successfully imported questions for {savedCount} audit template
                {savedCount !== 1 ? "s" : ""}.
              </p>
            </div>
          ) : (
            <>
              {/* Dropzone */}
              <div
                className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors"
                onClick={() => filesRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <input
                  ref={filesRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  className="hidden"
                  onChange={handleFilesSelect}
                />
                {files.length > 0 ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5 text-brand" />
                    <span className="text-sm font-medium text-foreground">
                      {files.length} file{files.length !== 1 ? "s" : ""} selected
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-sm text-muted">
                      Drop your audit <strong>.docx</strong> files here
                    </p>
                    <p className="text-xs text-muted mt-1">
                      e.g., Bathroom Safety Audit.docx, Emergency Management Audit.docx
                    </p>
                  </>
                )}
              </div>

              {/* Parsing spinner */}
              {parseMutation.isPending && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 text-brand animate-spin mr-2" />
                  <span className="text-sm text-muted">Parsing documents...</span>
                </div>
              )}

              {/* Results table */}
              {rows.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    {rows.length} Document{rows.length !== 1 ? "s" : ""} Parsed
                  </h3>
                  <div className="border rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted">File</th>
                          <th className="text-left px-3 py-2 font-medium text-muted">
                            Matched Template
                          </th>
                          <th className="text-center px-3 py-2 font-medium text-muted w-24">
                            Questions
                          </th>
                          <th className="text-center px-3 py-2 font-medium text-muted w-28">
                            Format
                          </th>
                          <th className="text-center px-3 py-2 font-medium text-muted w-16">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {rows.map((row, idx) => {
                          const effectiveId = getEffectiveTemplateId(row);
                          const hasError = !!row.error;
                          const noMatch = !hasError && !effectiveId;
                          const lowConfidence =
                            !hasError && effectiveId && row.match.confidence < 0.6;
                          const highConfidence =
                            !hasError && effectiveId && row.match.confidence >= 0.6;

                          return (
                            <tr key={idx} className="hover:bg-surface">
                              <td className="px-3 py-2 text-foreground max-w-[10rem] truncate">
                                {row.filename}
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={effectiveId || ""}
                                  onChange={(e) => handleOverride(idx, e.target.value)}
                                  disabled={hasError}
                                  className="w-full px-2 py-1 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 bg-card"
                                >
                                  <option value="">-- No match --</option>
                                  {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2 text-center text-muted">
                                {row.parsed ? row.parsed.items.length : "—"}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {row.parsed ? (
                                  <span className="inline-block px-2 py-0.5 text-xs font-medium bg-surface rounded-full text-muted">
                                    {row.parsed.detectedFormat.replace(/_/g, " ")}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {hasError && (
                                  <span title={row.error!}>
                                    <X className="w-4 h-4 text-red-500 mx-auto" />
                                  </span>
                                )}
                                {noMatch && (
                                  <span title="No template matched — assign manually">
                                    <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />
                                  </span>
                                )}
                                {lowConfidence && (
                                  <span
                                    title={`Low confidence match (${Math.round(row.match.confidence * 100)}%)`}
                                  >
                                    <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" />
                                  </span>
                                )}
                                {highConfidence && (
                                  <span
                                    title={`Matched (${Math.round(row.match.confidence * 100)}%)`}
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      {savableRows.length} ready to save
                    </span>
                    {rows.filter((r) => r.error).length > 0 && (
                      <span className="flex items-center gap-1">
                        <X className="w-3.5 h-3.5 text-red-500" />
                        {rows.filter((r) => r.error).length} failed
                      </span>
                    )}
                    {rows.filter((r) => !r.error && !getEffectiveTemplateId(r)).length > 0 && (
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        {rows.filter((r) => !r.error && !getEffectiveTemplateId(r)).length}{" "}
                        unmatched
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-surface/50">
          {saved ? (
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
                onClick={handleSave}
                disabled={savableRows.length === 0 || saveMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Save {savableRows.length} Audit Template{savableRows.length !== 1 ? "s" : ""}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
