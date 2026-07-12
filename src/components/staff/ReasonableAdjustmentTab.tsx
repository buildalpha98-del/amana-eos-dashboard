"use client";

/**
 * ReasonableAdjustmentTab — records of accommodation requests +
 * decisions under the DDA 1992 + Fair Work Act anti-discrimination
 * provisions.
 *
 * The most valuable thing this tab does is FORCE a written record.
 * "We thought about it and decided yes/no" is much harder to defend
 * than "here's the request, here's what we considered, here's the
 * decision and our reasoning." The form is the discipline.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  CalendarClock,
  FileText,
  ExternalLink,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { useEscapeClose } from "@/hooks/useEscapeClose";

type Status =
  | "under_assessment"
  | "provided"
  | "modified"
  | "declined"
  | "withdrawn"
  | "no_longer_needed";

interface Adjustment {
  id: string;
  userId: string;
  requestedAt: string;
  requestSummary: string;
  contextNotes: string | null;
  assessedAt: string | null;
  assessmentNotes: string | null;
  status: Status;
  decisionAt: string | null;
  decisionDetail: string | null;
  declineReasons: string | null;
  reviewAt: string | null;
  fileUrl: string | null;
  fileName: string | null;
  recordedBy: { id: string; name: string };
  createdAt: string;
}

const STATUS_META: Record<
  Status,
  { label: string; pill: string; icon: typeof CheckCircle2 }
> = {
  under_assessment: {
    label: "Under assessment",
    pill: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800",
    icon: Clock,
  },
  provided: {
    label: "Provided",
    pill: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  modified: {
    label: "Modified alternative",
    pill: "bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800",
    icon: CheckCircle2,
  },
  declined: {
    label: "Declined",
    pill: "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800",
    icon: XCircle,
  },
  withdrawn: {
    label: "Withdrawn",
    pill: "bg-surface text-foreground border-border",
    icon: XCircle,
  },
  no_longer_needed: {
    label: "No longer needed",
    pill: "bg-surface text-foreground/80 border-border",
    icon: CheckCircle2,
  },
};

function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export interface ReasonableAdjustmentTabProps {
  targetUserId: string;
  targetUserName: string;
}

export function ReasonableAdjustmentTab({
  targetUserId,
  targetUserName,
}: ReasonableAdjustmentTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Adjustment | null>(null);

  const { data, isLoading, error } = useQuery<
    { records: Adjustment[] },
    ApiResponseError
  >({
    queryKey: ["reasonable-adjustments", targetUserId],
    queryFn: () =>
      fetchApi(
        `/api/reasonable-adjustments?userId=${encodeURIComponent(targetUserId)}`,
      ),
    staleTime: 30_000,
  });

  const records = data?.records ?? [];

  // Surface reviews that are due/overdue as a soft prompt.
  const overdueReview = records.find((r) => {
    if (!r.reviewAt) return false;
    if (r.status !== "provided" && r.status !== "modified") return false;
    return new Date(r.reviewAt) <= new Date();
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Accommodation requests + decisions under the Disability Discrimination
          Act 1992. The legal test for declining is &ldquo;unjustifiable
          hardship&rdquo; — documented reasoning is the defence.
        </p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Record request
        </button>
      </div>

      {overdueReview && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Review due</p>
            <p className="text-xs mt-0.5">
              Scheduled review on {formatDate(overdueReview.reviewAt)} for the
              adjustment recorded {formatDate(overdueReview.requestedAt)}.
              Adjustments aren&apos;t set-and-forget — check whether it still
              meets the employee&apos;s needs.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">Unable to load adjustments.</p>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          No adjustment records on file.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {records.map((r) => {
            const meta = STATUS_META[r.status];
            const Icon = meta.icon;
            return (
              <li
                key={r.id}
                onClick={() => setEditing(r)}
                className="p-3 flex flex-wrap items-start gap-3 hover:bg-surface cursor-pointer"
              >
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-medium text-foreground line-clamp-2">
                    {r.requestSummary}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    Requested {formatDate(r.requestedAt)}
                    {r.decisionAt && ` · decided ${formatDate(r.decisionAt)}`}
                    {r.reviewAt && ` · review ${formatDate(r.reviewAt)}`}
                  </p>
                  {r.status === "declined" && !r.declineReasons && (
                    <p className="text-xs text-red-700 mt-1 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Declined without documented reasons — DDA exposure.
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium",
                    meta.pill,
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {addOpen && (
        <AdjustmentModal
          mode="create"
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editing && (
        <AdjustmentModal
          mode="edit"
          existing={editing}
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────

interface AdjustmentModalProps {
  mode: "create" | "edit";
  existing?: Adjustment;
  targetUserId: string;
  targetUserName: string;
  onClose: () => void;
}

function AdjustmentModal({
  mode,
  existing,
  targetUserId,
  targetUserName,
  onClose,
}: AdjustmentModalProps) {
  useEscapeClose(onClose);
  const qc = useQueryClient();

  const [status, setStatus] = useState<Status>(
    existing?.status ?? "under_assessment",
  );
  const [requestedAt, setRequestedAt] = useState(
    existing?.requestedAt?.slice(0, 10) ?? todayIso(),
  );
  const [requestSummary, setRequestSummary] = useState(
    existing?.requestSummary ?? "",
  );
  const [contextNotes, setContextNotes] = useState(existing?.contextNotes ?? "");

  const [assessedAt, setAssessedAt] = useState(
    existing?.assessedAt?.slice(0, 10) ?? "",
  );
  const [assessmentNotes, setAssessmentNotes] = useState(
    existing?.assessmentNotes ?? "",
  );

  const [decisionAt, setDecisionAt] = useState(
    existing?.decisionAt?.slice(0, 10) ?? "",
  );
  const [decisionDetail, setDecisionDetail] = useState(
    existing?.decisionDetail ?? "",
  );
  const [declineReasons, setDeclineReasons] = useState(
    existing?.declineReasons ?? "",
  );

  const [reviewAt, setReviewAt] = useState(existing?.reviewAt?.slice(0, 10) ?? "");

  const isDeclined = status === "declined";
  const declineMissing = isDeclined && declineReasons.trim().length < 20;

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        status,
        requestSummary: requestSummary.trim(),
        contextNotes: contextNotes.trim() || null,
        assessedAt: assessedAt || null,
        assessmentNotes: assessmentNotes.trim() || null,
        decisionAt: decisionAt || null,
        decisionDetail: decisionDetail.trim() || null,
        declineReasons: declineReasons.trim() || null,
        reviewAt: reviewAt || null,
      };
      if (mode === "create") {
        body.userId = targetUserId;
        body.requestedAt = requestedAt;
        return mutateApi("/api/reasonable-adjustments", {
          method: "POST",
          body,
        });
      }
      return mutateApi(`/api/reasonable-adjustments/${existing!.id}`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["reasonable-adjustments", targetUserId],
      });
      toast({
        description:
          mode === "create" ? "Adjustment recorded." : "Adjustment updated.",
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const canSubmit =
    requestSummary.trim().length > 0 && !declineMissing && !save.isPending;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose();
      }}
    >
      <div className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-2xl flex flex-col shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "create" ? "Record adjustment request" : "Edit adjustment"} ·{" "}
            {targetUserName}
          </h2>
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
          {/* Request */}
          <fieldset className="rounded-lg border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Request</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Requested on
                </label>
                <input
                  type="date"
                  value={requestedAt}
                  onChange={(e) => setRequestedAt(e.target.value)}
                  disabled={save.isPending || mode === "edit"}
                  max={todayIso()}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  disabled={save.isPending}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                >
                  {Object.entries(STATUS_META).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <textarea
              rows={3}
              value={requestSummary}
              onChange={(e) => setRequestSummary(e.target.value)}
              disabled={save.isPending}
              placeholder="What was requested? Plain language. e.g. 'Flexible start time 9–10am due to medical appointments' or 'Standing desk', 'Reduced sensory load in staff room'."
              maxLength={20_000}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
            <textarea
              rows={2}
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              disabled={save.isPending}
              placeholder="Context (optional, sensitive) — disability or protected attribute the adjustment relates to. The employee isn't required to disclose."
              maxLength={20_000}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </fieldset>

          {/* Assessment */}
          <fieldset className="rounded-lg border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Assessment</legend>
            <div>
              <label className="block text-xs font-medium mb-1">
                Assessed on
              </label>
              <input
                type="date"
                value={assessedAt}
                onChange={(e) => setAssessedAt(e.target.value)}
                disabled={save.isPending}
                className="w-full sm:max-w-[200px] rounded-md border border-border bg-card px-2 py-1.5 text-sm"
              />
            </div>
            <textarea
              rows={3}
              value={assessmentNotes}
              onChange={(e) => setAssessmentNotes(e.target.value)}
              disabled={save.isPending}
              placeholder="What was considered? Alternatives weighed, anyone consulted (OT, doctor's letter, HR advisor), operational trade-offs. The discipline of writing this down IS the defence."
              maxLength={20_000}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </fieldset>

          {/* Decision */}
          <fieldset className="rounded-lg border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Decision</legend>
            <div>
              <label className="block text-xs font-medium mb-1">
                Decision date
              </label>
              <input
                type="date"
                value={decisionAt}
                onChange={(e) => setDecisionAt(e.target.value)}
                disabled={save.isPending}
                className="w-full sm:max-w-[200px] rounded-md border border-border bg-card px-2 py-1.5 text-sm"
              />
            </div>
            <textarea
              rows={3}
              value={decisionDetail}
              onChange={(e) => setDecisionDetail(e.target.value)}
              disabled={save.isPending}
              placeholder="What was provided? If 'modified', describe the alternative offered."
              maxLength={20_000}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
            {isDeclined && (
              <div>
                <label className="block text-xs font-medium mb-1">
                  Decline reasons{" "}
                  <span className="text-red-700">*</span>
                </label>
                <textarea
                  rows={4}
                  value={declineReasons}
                  onChange={(e) => setDeclineReasons(e.target.value)}
                  disabled={save.isPending}
                  placeholder="State the 'unjustifiable hardship' basis. Be specific — costs, operational impact, why no alternative is workable. Vague reasons are indefensible."
                  maxLength={20_000}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
                {declineMissing && (
                  <p className="mt-1 text-xs text-red-700">
                    Decline reasons need at least 20 characters citing the
                    unjustifiable hardship basis.
                  </p>
                )}
              </div>
            )}
          </fieldset>

          {/* Review */}
          <fieldset className="rounded-lg border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Review</legend>
            <div>
              <label className="block text-xs font-medium mb-1">
                Next review date{" "}
                <span className="text-muted font-normal">(recommended)</span>
              </label>
              <input
                type="date"
                value={reviewAt}
                onChange={(e) => setReviewAt(e.target.value)}
                disabled={save.isPending}
                className="w-full sm:max-w-[200px] rounded-md border border-border bg-card px-2 py-1.5 text-sm"
              />
              <p className="mt-1 text-xs text-muted">
                Adjustments aren&apos;t set-and-forget. A 6 or 12-month review
                catches changes in the employee&apos;s needs or the operational
                environment.
              </p>
            </div>
          </fieldset>

          {existing?.fileUrl && (
            <a
              href={existing.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand hover:underline inline-flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              {existing.fileName ?? "Linked file"}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <footer className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="px-4 py-2 text-sm text-muted rounded-md border border-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "create" ? "Record" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}
