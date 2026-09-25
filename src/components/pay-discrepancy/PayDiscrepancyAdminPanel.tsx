"use client";

/**
 * PayDiscrepancyAdminPanel — the admin-side review queue for reports
 * staff submit from My Portal's Pay Discrepancy card. Lives inside
 * /leave-payroll (a "Pay discrepancies" tab) since that's already the
 * admin payroll review surface — this isn't EH-sourced like the rest
 * of that page, it's a plain local DB table.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";

interface PayDiscrepancyReport {
  id: string;
  discrepancyDate: string;
  hoursShort: number;
  description: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  resolutionNotes: string | null;
  createdAt: string;
  reporter: { id: string; name: string; email: string; avatar: string | null };
  service: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
}

function statusTone(status: string): string {
  switch (status) {
    case "resolved":
      return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
    case "dismissed":
      return "bg-surface text-foreground/80 border-border";
    case "reviewing":
      return "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    default:
      return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function PayDiscrepancyAdminPanel() {
  const { data, isLoading, error, refetch } = useQuery<{ reports: PayDiscrepancyReport[] }>({
    queryKey: ["pay-discrepancies-admin"],
    queryFn: () => fetchApi("/api/pay-discrepancies"),
    staleTime: 30_000,
  });

  const reports = data?.reports ?? [];

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-900 dark:text-red-200 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Unable to load pay discrepancy reports.</p>
      </div>
    );
  }
  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">No pay discrepancy reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {reports.map((r) => (
        <ReportRow key={r.id} report={r} onChanged={refetch} />
      ))}
    </div>
  );
}

function ReportRow({
  report,
  onChanged,
}: {
  report: PayDiscrepancyReport;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(report.resolutionNotes ?? "");
  const isOpen = report.status === "open" || report.status === "reviewing";

  const update = useMutation({
    mutationFn: (status: "reviewing" | "resolved" | "dismissed") =>
      mutateApi(`/api/pay-discrepancies/${report.id}`, {
        method: "PATCH",
        body: { status, resolutionNotes: notes.trim() || undefined },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pay-discrepancies-admin"] });
      onChanged();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {report.reporter.name} — {report.hoursShort} hour{report.hoursShort === 1 ? "" : "s"} short,{" "}
            {formatDate(report.discrepancyDate)}
            {report.service ? ` · ${report.service.name}` : ""}
          </p>
          {report.description ? <p className="text-xs text-muted mt-0.5">{report.description}</p> : null}
          {report.reviewedBy ? (
            <p className="text-2xs text-muted mt-1">Reviewed by {report.reviewedBy.name}</p>
          ) : null}
        </div>
        <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${statusTone(report.status)}`}>
          {report.status}
        </span>
      </div>

      {isOpen && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Resolution note (optional)"
            className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <div className="flex gap-2 shrink-0">
            {report.status === "open" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => update.mutate("reviewing")}
                loading={update.isPending && update.variables === "reviewing"}
              >
                Start review
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => update.mutate("resolved")}
              loading={update.isPending && update.variables === "resolved"}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Resolve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update.mutate("dismissed")}
              loading={update.isPending && update.variables === "dismissed"}
            >
              <XCircle className="w-3.5 h-3.5" />
              Dismiss
            </Button>
          </div>
        </div>
      )}
      {!isOpen && report.resolutionNotes ? (
        <p className="text-xs text-muted mt-2 italic">Note: {report.resolutionNotes}</p>
      ) : null}
    </div>
  );
}
