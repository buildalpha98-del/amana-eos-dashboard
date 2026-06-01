"use client";

/**
 * /safe-reports — admin triage list. Owner / head_office only.
 *
 * Read-only-feeling list view with click-through to detail (status
 * + review notes editing happens in a slide-over modal inline).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

interface SafeReport {
  id: string;
  category: string;
  serviceId: string | null;
  service: { id: string; name: string; code: string } | null;
  content: string;
  status: "received" | "under_review" | "resolved" | "closed_no_action";
  reviewNotes: string | null;
  reviewedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  createdAt: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  harassment: "Harassment",
  discrimination: "Discrimination",
  bullying: "Bullying",
  safety: "Workplace safety",
  conduct: "Conduct",
  retaliation: "Retaliation",
  child_safety: "Child safety",
  other: "Other",
};

function categoryUrgencyClass(c: string): string {
  // Retaliation + child_safety + harassment are the highest-stakes —
  // surface them visually so the reviewer doesn't skim past.
  if (c === "child_safety" || c === "retaliation")
    return "bg-red-100 text-red-800 border-red-300";
  if (c === "harassment" || c === "discrimination")
    return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-blue-50 text-blue-800 border-blue-200";
}

function statusPill(status: string): { class: string; label: string } {
  switch (status) {
    case "received":
      return {
        class: "bg-amber-50 text-amber-800 border-amber-200",
        label: "Received",
      };
    case "under_review":
      return {
        class: "bg-blue-50 text-blue-800 border-blue-200",
        label: "Under review",
      };
    case "resolved":
      return {
        class: "bg-emerald-50 text-emerald-800 border-emerald-200",
        label: "Resolved",
      };
    case "closed_no_action":
      return {
        class: "bg-gray-100 text-gray-700 border-gray-200",
        label: "Closed (no action)",
      };
    default:
      return { class: "bg-gray-100 text-gray-800", label: status };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SafeReportsClient() {
  const [selected, setSelected] = useState<SafeReport | null>(null);

  const { data, isLoading, error } = useQuery<{ reports: SafeReport[] }>({
    queryKey: ["safe-reports"],
    queryFn: () => fetchApi("/api/safe-reports"),
    staleTime: 30_000,
  });

  const reports = data?.reports ?? [];
  const open = reports.filter(
    (r) => r.status === "received" || r.status === "under_review",
  );
  const closed = reports.filter(
    (r) => r.status === "resolved" || r.status === "closed_no_action",
  );

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6 text-brand" />
          Safe reports
        </h1>
        <p className="text-sm text-muted mt-1 max-w-3xl">
          Anonymous reports submitted via the public Safe Reporting channel.
          Visible only to owner + head office. The reporter&apos;s identity is
          never recorded — only the report content and category. Statute of
          limitations on harassment claims can be 6+ years; keep records
          accordingly.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">Unable to load reports.</p>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Shield className="w-8 h-8 text-border mx-auto mb-2" />
          <p className="text-sm text-muted">
            No reports yet. The public submission form is at{" "}
            <a href="/safe-report" className="text-brand hover:underline">
              /safe-report
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/80 mb-2">
                Open ({open.length})
              </h2>
              <ReportList reports={open} onClick={setSelected} />
            </section>
          )}
          {closed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60 mb-2">
                Closed ({closed.length})
              </h2>
              <ReportList reports={closed} onClick={setSelected} />
            </section>
          )}
        </>
      )}

      {selected && (
        <ReportDetail
          report={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ReportList({
  reports,
  onClick,
}: {
  reports: SafeReport[];
  onClick: (r: SafeReport) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {reports.map((r) => {
        const pill = statusPill(r.status);
        return (
          <li
            key={r.id}
            className="p-3 flex flex-wrap items-start gap-3 hover:bg-surface cursor-pointer"
            onClick={() => onClick(r)}
          >
            <span
              className={cn(
                "shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium",
                categoryUrgencyClass(r.category),
              )}
            >
              {CATEGORY_LABEL[r.category] ?? r.category}
            </span>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm text-foreground line-clamp-2">
                {r.content}
              </p>
              <p className="text-xs text-muted mt-1">
                {formatDate(r.createdAt)}
                {r.service && ` · ${r.service.name}`}
                {r.reviewedBy && ` · Reviewer: ${r.reviewedBy.name}`}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium",
                pill.class,
              )}
            >
              {pill.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ReportDetail({
  report,
  onClose,
}: {
  report: SafeReport;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(report.status);
  const [reviewNotes, setReviewNotes] = useState(report.reviewNotes ?? "");

  const save = useMutation({
    mutationFn: () =>
      mutateApi(`/api/safe-reports/${report.id}`, {
        method: "PATCH",
        body: { status, reviewNotes: reviewNotes || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["safe-reports"] });
      toast({ description: "Report updated." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose();
      }}
    >
      <div className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-2xl flex flex-col shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {CATEGORY_LABEL[report.category] ?? report.category} report
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Received {formatDate(report.createdAt)}
              {report.service && ` · ${report.service.name}`} · id{" "}
              <code className="text-[10px]">{report.id}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Report content
            </p>
            <div className="text-sm text-foreground whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono">
              {report.content}
            </div>
          </section>

          <section>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as SafeReport["status"])
              }
              disabled={save.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="received">Received</option>
              <option value="under_review">Under review</option>
              <option value="resolved">Resolved</option>
              <option value="closed_no_action">Closed — no action</option>
            </select>
          </section>

          <section>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Review notes <span className="text-muted font-normal">(private)</span>
            </label>
            <textarea
              id="notes"
              rows={6}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              disabled={save.isPending}
              placeholder="What was investigated, who was contacted, agreed actions. Visible only to owner / head office."
              maxLength={20_000}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
            {report.reviewedBy && (
              <p className="mt-1 text-xs text-muted">
                Last reviewed by {report.reviewedBy.name}
                {report.resolvedAt && ` · Resolved ${formatDate(report.resolvedAt)}`}
              </p>
            )}
          </section>
        </div>

        <footer className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-md border border-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
          >
            {save.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Save changes
          </button>
        </footer>
      </div>
    </div>
  );
}
