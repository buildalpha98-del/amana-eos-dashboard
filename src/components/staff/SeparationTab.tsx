"use client";

/**
 * SeparationTab — captures the formal separation record for a staff
 * member. Admin / owner / head_office only.
 *
 * The data point Fair Work will ask for: "why did they leave, when,
 * was final pay processed, was a reference issued, are they eligible
 * for rehire?" — all in one form, all auditable.
 *
 * Operates alongside the existing StaffOffboarding pack (the
 * operational checklist). This tab is the legal-fact layer.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ExternalLink,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

const REASONS: Array<{ key: SeparationReason; label: string; hint?: string }> = [
  { key: "resignation", label: "Resignation" },
  {
    key: "dismissal_capacity",
    label: "Dismissal — capacity",
    hint: "Unable to perform the inherent requirements of the role.",
  },
  {
    key: "dismissal_misconduct",
    label: "Dismissal — misconduct",
    hint: "Serious or sustained misconduct. Link the PerformanceCase chain below.",
  },
  { key: "redundancy", label: "Redundancy" },
  { key: "end_of_contract", label: "End of contract", hint: "Fixed-term contract completed." },
  { key: "mutual_separation", label: "Mutual separation" },
  { key: "retirement", label: "Retirement" },
  {
    key: "abandonment",
    label: "Abandonment",
    hint: "Staff stopped showing up and didn't respond to contact. Document attempted contact in reasonDetail.",
  },
  { key: "deceased", label: "Deceased" },
  { key: "other", label: "Other" },
];

type SeparationReason =
  | "resignation"
  | "dismissal_capacity"
  | "dismissal_misconduct"
  | "redundancy"
  | "end_of_contract"
  | "mutual_separation"
  | "retirement"
  | "abandonment"
  | "deceased"
  | "other";

interface SeparationRecord {
  id: string;
  userId: string;
  reason: SeparationReason;
  reasonDetail: string | null;
  noticeStartDate: string | null;
  lastWorkingDay: string;
  noticePeriodWeeks: number | null;
  finalPayProcessed: boolean;
  finalPayProcessedAt: string | null;
  finalPayNotes: string | null;
  referenceLetterIssued: boolean;
  referenceLetterUrl: string | null;
  referenceNotes: string | null;
  eligibleForRehire: boolean;
  rehireNotes: string | null;
  exitInterviewCompleted: boolean;
  exitInterviewNotes: string | null;
  exitInterviewAt: string | null;
  performanceCaseId: string | null;
  performanceCase: {
    id: string;
    type: string;
    title: string;
    occurredAt: string;
  } | null;
  recordedBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface SeparationTabProps {
  targetUserId: string;
  targetUserName: string;
}

function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SeparationTab({
  targetUserId,
  targetUserName,
}: SeparationTabProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data, isLoading, error } = useQuery<
    { record: SeparationRecord | null },
    ApiResponseError
  >({
    queryKey: ["separation", targetUserId],
    queryFn: () =>
      fetchApi(`/api/separations?userId=${encodeURIComponent(targetUserId)}`),
    staleTime: 30_000,
  });

  const record = data?.record ?? null;
  // Auto-open the form if no record exists, so admins land on the
  // input (not an empty placeholder).
  useEffect(() => {
    if (!isLoading && !record && !editing) {
      // Don't auto-open — explicit Create click feels more deliberate
      // for a record this consequential. Leave the placeholder visible.
    }
  }, [isLoading, record, editing]);

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">Unable to load.</p>;

  if (editing || (record && editing)) {
    return (
      <SeparationForm
        targetUserId={targetUserId}
        targetUserName={targetUserName}
        existing={record}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["separation", targetUserId] });
          setEditing(false);
          toast({ description: "Separation record saved." });
        }}
      />
    );
  }

  if (!record) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted mb-4">
          No separation record for {targetUserName}.
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
        >
          <Plus className="w-4 h-4" />
          Create separation record
        </button>
        <p className="text-xs text-muted mt-3">
          Used when a staff member leaves the organisation. Captures the
          formal facts (reason, notice, final pay, reference, rehire
          eligibility) for the 7-year Fair Work retention window.
        </p>
      </div>
    );
  }

  return (
    <SeparationView
      record={record}
      onEdit={() => setEditing(true)}
    />
  );
}

// ─── Read view ────────────────────────────────────────────────────────

function SeparationView({
  record,
  onEdit,
}: {
  record: SeparationRecord;
  onEdit: () => void;
}) {
  const reasonLabel =
    REASONS.find((r) => r.key === record.reason)?.label ?? record.reason;
  const isDismissal =
    record.reason === "dismissal_capacity" ||
    record.reason === "dismissal_misconduct";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Reason
          </p>
          <p className="text-lg font-semibold text-foreground mt-1">
            {reasonLabel}
          </p>
          <p className="text-xs text-muted mt-1">
            Last working day {formatDate(record.lastWorkingDay)} · Recorded by{" "}
            {record.recordedBy.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface"
        >
          Edit
        </button>
      </div>

      {isDismissal && !record.performanceCase && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Dismissal recorded without a linked PerformanceCase. Fair Work
            procedural-fairness defence is weaker without the warning chain.
            Link the prior case under Edit → Linked disciplinary case.
          </span>
        </div>
      )}

      {record.reasonDetail && (
        <Field label="Detail">{record.reasonDetail}</Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Notice period">
          {record.noticePeriodWeeks
            ? `${record.noticePeriodWeeks} weeks`
            : "—"}
          {record.noticeStartDate && (
            <span className="text-muted">
              {" "}
              · started {formatDate(record.noticeStartDate)}
            </span>
          )}
        </Field>
        <Field label="Final pay">
          {record.finalPayProcessed ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Processed
              {record.finalPayProcessedAt &&
                ` ${formatDate(record.finalPayProcessedAt)}`}
            </span>
          ) : (
            <span className="text-amber-700">Not yet processed</span>
          )}
        </Field>
      </div>

      {record.finalPayNotes && (
        <Field label="Final pay notes">{record.finalPayNotes}</Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Reference letter">
          {record.referenceLetterIssued ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Issued
              {record.referenceLetterUrl && (
                <a
                  href={record.referenceLetterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-brand hover:underline inline-flex items-center gap-0.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Open
                </a>
              )}
            </span>
          ) : (
            <span className="text-muted">Not issued</span>
          )}
        </Field>
        <Field label="Eligible for rehire">
          {record.eligibleForRehire ? (
            <span className="text-emerald-700">Yes</span>
          ) : (
            <span className="text-red-700">No</span>
          )}
        </Field>
      </div>

      {record.referenceNotes && (
        <Field label="Reference notes">{record.referenceNotes}</Field>
      )}
      {record.rehireNotes && (
        <Field label="Rehire notes">{record.rehireNotes}</Field>
      )}

      <Field label="Exit interview">
        {record.exitInterviewCompleted ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Conducted{" "}
            {record.exitInterviewAt && formatDate(record.exitInterviewAt)}
          </span>
        ) : (
          <span className="text-muted">Not conducted</span>
        )}
      </Field>
      {record.exitInterviewNotes && (
        <Field label="Exit interview notes">{record.exitInterviewNotes}</Field>
      )}

      {record.performanceCase && (
        <Field label="Linked disciplinary case">
          <a
            href={`/staff/${record.userId}#performance-cases-${record.performanceCase.id}`}
            className="text-brand hover:underline inline-flex items-center gap-0.5"
          >
            {record.performanceCase.title}{" "}
            <span className="text-muted">
              ({record.performanceCase.type.replace(/_/g, " ")})
            </span>
            <ExternalLink className="w-3 h-3 ml-0.5" />
          </a>
        </Field>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="text-sm text-foreground mt-1 whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────

interface SeparationFormProps {
  targetUserId: string;
  targetUserName: string;
  existing: SeparationRecord | null;
  onCancel: () => void;
  onSaved: () => void;
}

function SeparationForm({
  targetUserId,
  targetUserName,
  existing,
  onCancel,
  onSaved,
}: SeparationFormProps) {
  const [reason, setReason] = useState<SeparationReason>(
    existing?.reason ?? "resignation",
  );
  const [reasonDetail, setReasonDetail] = useState(existing?.reasonDetail ?? "");
  const [noticeStartDate, setNoticeStartDate] = useState(
    existing?.noticeStartDate?.slice(0, 10) ?? "",
  );
  const [lastWorkingDay, setLastWorkingDay] = useState(
    existing?.lastWorkingDay?.slice(0, 10) ?? todayIso(),
  );
  const [noticePeriodWeeks, setNoticePeriodWeeks] = useState(
    existing?.noticePeriodWeeks?.toString() ?? "",
  );
  const [finalPayProcessed, setFinalPayProcessed] = useState(
    existing?.finalPayProcessed ?? false,
  );
  const [finalPayNotes, setFinalPayNotes] = useState(
    existing?.finalPayNotes ?? "",
  );
  const [referenceLetterIssued, setReferenceLetterIssued] = useState(
    existing?.referenceLetterIssued ?? false,
  );
  const [referenceLetterUrl, setReferenceLetterUrl] = useState(
    existing?.referenceLetterUrl ?? "",
  );
  const [referenceNotes, setReferenceNotes] = useState(
    existing?.referenceNotes ?? "",
  );
  const [eligibleForRehire, setEligibleForRehire] = useState(
    existing?.eligibleForRehire ?? true,
  );
  const [rehireNotes, setRehireNotes] = useState(existing?.rehireNotes ?? "");
  const [exitInterviewCompleted, setExitInterviewCompleted] = useState(
    existing?.exitInterviewCompleted ?? false,
  );
  const [exitInterviewNotes, setExitInterviewNotes] = useState(
    existing?.exitInterviewNotes ?? "",
  );

  const isDismissal = useMemo(
    () => reason === "dismissal_capacity" || reason === "dismissal_misconduct",
    [reason],
  );
  const reasonDetailRequired = isDismissal && reasonDetail.trim().length < 20;

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        reason,
        reasonDetail: reasonDetail.trim() || null,
        noticeStartDate: noticeStartDate || null,
        lastWorkingDay,
        noticePeriodWeeks: noticePeriodWeeks
          ? Number(noticePeriodWeeks)
          : null,
        finalPayProcessed,
        finalPayProcessedAt: finalPayProcessed
          ? existing?.finalPayProcessedAt ?? new Date().toISOString()
          : null,
        finalPayNotes: finalPayNotes.trim() || null,
        referenceLetterIssued,
        referenceLetterUrl: referenceLetterUrl.trim() || null,
        referenceNotes: referenceNotes.trim() || null,
        eligibleForRehire,
        rehireNotes: rehireNotes.trim() || null,
        exitInterviewCompleted,
        exitInterviewNotes: exitInterviewNotes.trim() || null,
      };
      if (existing) {
        return mutateApi(
          `/api/separations?userId=${encodeURIComponent(targetUserId)}`,
          { method: "PATCH", body },
        );
      }
      return mutateApi("/api/separations", {
        method: "POST",
        body: { ...body, userId: targetUserId },
      });
    },
    onSuccess: onSaved,
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const canSubmit = !!lastWorkingDay && !reasonDetailRequired && !save.isPending;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Recording separation for {targetUserName}. Captured for the 7-year
        Fair Work retention window.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="sep-reason" className="block text-sm font-medium mb-1">
            Reason
          </label>
          <select
            id="sep-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as SeparationReason)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          {REASONS.find((r) => r.key === reason)?.hint && (
            <p className="mt-1 text-xs text-muted">
              {REASONS.find((r) => r.key === reason)?.hint}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="sep-last-day" className="block text-sm font-medium mb-1">
            Last working day
          </label>
          <input
            id="sep-last-day"
            type="date"
            value={lastWorkingDay}
            onChange={(e) => setLastWorkingDay(e.target.value)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label htmlFor="sep-detail" className="block text-sm font-medium mb-1">
          Detail
          {isDismissal && <span className="text-red-700"> *</span>}
          {!isDismissal && (
            <span className="text-muted font-normal"> (optional)</span>
          )}
        </label>
        <textarea
          id="sep-detail"
          rows={5}
          value={reasonDetail}
          onChange={(e) => setReasonDetail(e.target.value)}
          disabled={save.isPending}
          placeholder={
            isDismissal
              ? "Required: what happened, what warnings were given, what was the final triggering event. Write as if Fair Work might read it."
              : "Optional context — e.g. what role they moved to, family reasons, etc."
          }
          maxLength={20_000}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        {reasonDetailRequired && (
          <p className="mt-1 text-xs text-red-700">
            Dismissal records require at least 20 characters of detail.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="sep-notice-start"
            className="block text-sm font-medium mb-1"
          >
            Notice start date{" "}
            <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="sep-notice-start"
            type="date"
            value={noticeStartDate}
            onChange={(e) => setNoticeStartDate(e.target.value)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="sep-notice-weeks"
            className="block text-sm font-medium mb-1"
          >
            Notice period (weeks){" "}
            <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="sep-notice-weeks"
            type="number"
            step="0.5"
            min="0"
            value={noticePeriodWeeks}
            onChange={(e) => setNoticePeriodWeeks(e.target.value)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Final pay */}
      <fieldset className="rounded-lg border border-border p-3 space-y-3">
        <legend className="px-1 text-sm font-medium">Final pay</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={finalPayProcessed}
            onChange={(e) => setFinalPayProcessed(e.target.checked)}
            disabled={save.isPending}
          />
          Final pay has been processed
        </label>
        <textarea
          value={finalPayNotes}
          onChange={(e) => setFinalPayNotes(e.target.value)}
          disabled={save.isPending}
          placeholder="Notes — e.g. unused leave paid out, deductions, super contribution finalised."
          rows={2}
          maxLength={20_000}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </fieldset>

      {/* Reference */}
      <fieldset className="rounded-lg border border-border p-3 space-y-3">
        <legend className="px-1 text-sm font-medium">Reference letter</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={referenceLetterIssued}
            onChange={(e) => setReferenceLetterIssued(e.target.checked)}
            disabled={save.isPending}
          />
          Reference letter issued
        </label>
        <input
          type="url"
          value={referenceLetterUrl}
          onChange={(e) => setReferenceLetterUrl(e.target.value)}
          disabled={save.isPending || !referenceLetterIssued}
          placeholder="https://… link to the signed reference"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
        />
        <textarea
          value={referenceNotes}
          onChange={(e) => setReferenceNotes(e.target.value)}
          disabled={save.isPending}
          placeholder="Reference notes — what was/wasn't said. Consistency matters if future employers call."
          rows={2}
          maxLength={20_000}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </fieldset>

      {/* Rehire */}
      <fieldset className="rounded-lg border border-border p-3 space-y-3">
        <legend className="px-1 text-sm font-medium">Rehire eligibility</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={eligibleForRehire}
            onChange={(e) => setEligibleForRehire(e.target.checked)}
            disabled={save.isPending}
          />
          Eligible to be rehired
        </label>
        <textarea
          value={rehireNotes}
          onChange={(e) => setRehireNotes(e.target.value)}
          disabled={save.isPending}
          placeholder="Notes for the casual pool / recruitment view. e.g. 'Yes, but not as a Lead Educator.'"
          rows={2}
          maxLength={20_000}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </fieldset>

      {/* Exit interview */}
      <fieldset className="rounded-lg border border-border p-3 space-y-3">
        <legend className="px-1 text-sm font-medium">Exit interview</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={exitInterviewCompleted}
            onChange={(e) => setExitInterviewCompleted(e.target.checked)}
            disabled={save.isPending}
          />
          Conducted
        </label>
        <textarea
          value={exitInterviewNotes}
          onChange={(e) => setExitInterviewNotes(e.target.value)}
          disabled={save.isPending || !exitInterviewCompleted}
          placeholder="Key themes from the conversation. What worked, what didn't, what would they change."
          rows={3}
          maxLength={20_000}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
        />
      </fieldset>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={save.isPending}
          className="px-3 py-1.5 text-sm text-muted rounded-md border border-border disabled:opacity-50"
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
          {existing ? "Save changes" : "Create record"}
        </button>
      </div>
    </div>
  );
}
