"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  useAuditInstances,
  usePreviewCalendar,
  useImportCalendar,
  type AuditInstanceSummary,
  type CalendarTemplatePreview,
} from "@/hooks/useAudits";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  SkipForward,
  Loader2,
  Filter,
  Upload,
  X,
  FileText,
  Check,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const qaLabels: Record<number, string> = {
  1: "Educational Program",
  2: "Health & Safety",
  3: "Physical Environment",
  4: "Staffing",
  5: "Relationships",
  6: "Partnerships",
  7: "Governance",
};

const statusConfig: Record<string, { color: string; bg: string; border: string; icon: typeof Clock }> = {
  scheduled: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: Clock },
  in_progress: { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: Play },
  completed: { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2 },
  overdue: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: AlertTriangle },
  skipped: { color: "text-muted", bg: "bg-surface/50", border: "border-border", icon: SkipForward },
};

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

const freqLabels: Record<string, string> = {
  monthly: "Monthly",
  half_yearly: "Half Yearly",
  yearly: "Yearly",
};

/* ------------------------------------------------------------------ */
/* Upload Calendar Dialog                                              */
/* ------------------------------------------------------------------ */

function UploadCalendarDialog({
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

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function AuditCalendarTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [serviceFilter, setServiceFilter] = useState("");
  const [qaFilter, setQaFilter] = useState("");
  const [showUploadCalendar, setShowUploadCalendar] = useState(false);

  const { data, isLoading } = useAuditInstances({
    year,
    serviceId: serviceFilter || undefined,
    qualityArea: qaFilter || undefined,
  });

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services?limit=100");
      if (!res.ok) return [];
      const d = await res.json();
      return d.services || d;
    },
  });

  // Group instances by month
  const byMonth = useMemo(() => {
    const map: Record<number, AuditInstanceSummary[]> = {};
    for (let m = 1; m <= 12; m++) map[m] = [];
    if (data?.instances) {
      for (const inst of data.instances) {
        if (!map[inst.scheduledMonth]) map[inst.scheduledMonth] = [];
        map[inst.scheduledMonth].push(inst);
      }
    }
    return map;
  }, [data?.instances]);

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Scheduled", value: stats.scheduled, color: "text-blue-700 bg-blue-50" },
            { label: "In Progress", value: stats.in_progress, color: "text-amber-700 bg-amber-50" },
            { label: "Completed", value: stats.completed, color: "text-emerald-700 bg-emerald-50" },
            { label: "Overdue", value: stats.overdue, color: "text-red-700 bg-red-50" },
            {
              label: "Avg Score",
              value: stats.avgScore != null ? `${stats.avgScore}%` : "—",
              color: "text-brand bg-brand/5",
            },
          ].map((s) => (
            <div key={s.label} className={cn("rounded-xl p-4 text-center", s.color)}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-1.5 rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-muted" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[4rem] text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="p-1.5 rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-muted" />
          </button>
        </div>

        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        >
          <option value="">All Centres</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={qaFilter}
          onChange={(e) => setQaFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        >
          <option value="">All Quality Areas</option>
          {[1, 2, 3, 4, 5, 6, 7].map((qa) => (
            <option key={qa} value={String(qa)}>
              QA{qa} — {qaLabels[qa]}
            </option>
          ))}
        </select>

        <div className="ml-auto">
          <button
            onClick={() => setShowUploadCalendar(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand/90 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Calendar
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const audits = byMonth[month] || [];
            const isPast = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
            const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

            return (
              <div
                key={month}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  isCurrent
                    ? "border-brand bg-brand/5 ring-1 ring-brand/20"
                    : "border-border bg-card"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4
                    className={cn(
                      "text-sm font-semibold",
                      isCurrent ? "text-brand" : isPast ? "text-muted" : "text-foreground"
                    )}
                  >
                    {monthNames[month - 1]}
                  </h4>
                  {audits.length > 0 && (
                    <span className="text-xs font-medium text-muted bg-surface px-2 py-0.5 rounded-full">
                      {audits.length}
                    </span>
                  )}
                </div>

                {audits.length === 0 ? (
                  <p className="text-xs text-muted italic">No audits scheduled</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {audits.map((audit) => {
                      const cfg = statusConfig[audit.status] || statusConfig.scheduled;
                      const Icon = cfg.icon;
                      return (
                        <Link
                          key={audit.id}
                          href={`/compliance/audit/${audit.id}`}
                          className={cn(
                            "block p-2 rounded-lg border text-left hover:shadow-sm transition-all",
                            cfg.bg,
                            cfg.border
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", cfg.color)} />
                            <div className="min-w-0">
                              <p className={cn("text-xs font-medium truncate", cfg.color)}>
                                {audit.template.name}
                              </p>
                              <p className="text-[10px] text-muted truncate">
                                {audit.service.code} · QA{audit.template.qualityArea}
                                {audit.complianceScore != null && ` · ${audit.complianceScore}%`}
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Calendar Dialog */}
      <UploadCalendarDialog
        open={showUploadCalendar}
        onClose={() => setShowUploadCalendar(false)}
        currentYear={year}
      />
    </div>
  );
}
