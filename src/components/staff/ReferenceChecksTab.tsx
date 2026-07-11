"use client";

/**
 * ReferenceChecksTab — admin sub-tab on the staff profile.
 *
 * Captures structured reference checks performed during hiring.
 * Admin-only. Staff never see references taken about themselves
 * through this surface — defensive against the subject reading
 * potentially identifying detail about a third-party referee.
 *
 * 2026-06-01: introduced as a defence against negligent-hiring
 *             claims (esp. childcare's elevated vetting standard).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PhoneCall,
  Mail,
  Video,
  FileText,
  Users as UsersIcon,
  Plus,
  Loader2,
  X,
  Pencil,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  CircleAlert,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { useEscapeClose } from "@/hooks/useEscapeClose";

// ── Types ────────────────────────────────────────────────────────────

type RefMethod = "phone" | "video" | "email" | "written_response" | "in_person";

type RefStatus =
  | "pending"
  | "contacted"
  | "completed"
  | "unable_to_reach"
  | "declined";

type RefRecommendation =
  | "strong_positive"
  | "positive"
  | "neutral"
  | "reservations"
  | "do_not_recommend";

interface ReferenceCheck {
  id: string;
  userId: string;
  checkedById: string;
  checkedBy: { id: string; name: string };
  refereeName: string;
  refereeRelationship: string;
  refereeOrganisation: string | null;
  refereePhone: string | null;
  refereeEmail: string | null;
  method: RefMethod;
  contactedAt: string | null;
  status: RefStatus;
  recommendation: RefRecommendation | null;
  notes: string;
  redFlags: string | null;
  employmentVerified: boolean | null;
  wouldRehire: boolean | null;
  createdAt: string;
}

const METHOD_META: Record<RefMethod, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  phone: { label: "Phone", icon: PhoneCall },
  video: { label: "Video", icon: Video },
  email: { label: "Email", icon: Mail },
  written_response: { label: "Written response", icon: FileText },
  in_person: { label: "In person", icon: UsersIcon },
};

const STATUS_LABEL: Record<RefStatus, string> = {
  pending: "Pending",
  contacted: "Contacted",
  completed: "Completed",
  unable_to_reach: "Unable to reach",
  declined: "Declined",
};

const RECOMMENDATION_LABEL: Record<RefRecommendation, string> = {
  strong_positive: "Strong positive",
  positive: "Positive",
  neutral: "Neutral",
  reservations: "Has reservations",
  do_not_recommend: "Do not recommend",
};

function statusPill(s: RefStatus): string {
  switch (s) {
    case "completed":
      return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
    case "contacted":
      return "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    case "unable_to_reach":
    case "declined":
      return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
    default:
      return "bg-surface text-foreground/80 border-border";
  }
}

function recommendationPill(r: RefRecommendation): string {
  switch (r) {
    case "strong_positive":
    case "positive":
      return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
    case "neutral":
      return "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    case "reservations":
      return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
    case "do_not_recommend":
      return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";
  }
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

// ── Component ────────────────────────────────────────────────────────

export interface ReferenceChecksTabProps {
  targetUserId: string;
  targetUserName: string;
  viewerRole: string;
}

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

export function ReferenceChecksTab({
  targetUserId,
  targetUserName,
  viewerRole,
}: ReferenceChecksTabProps) {
  const isAdmin = ADMIN_ROLES.has(viewerRole);
  const isOwner = viewerRole === "owner";

  const [createOpen, setCreateOpen] = useState(false);
  const [detailFor, setDetailFor] = useState<ReferenceCheck | null>(null);

  const { data, isLoading, error } = useQuery<
    { checks: ReferenceCheck[] },
    ApiResponseError
  >({
    queryKey: ["reference-checks", targetUserId],
    queryFn: () =>
      fetchApi(
        `/api/reference-checks?userId=${encodeURIComponent(targetUserId)}`,
      ),
    staleTime: 30_000,
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted italic">
        Reference checks are admin-only.
      </p>
    );
  }

  const checks = data?.checks ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Reference checks performed during {targetUserName}&apos;s hiring.
          Retained 7 years per Fair Work record-keeping.
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add reference check
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">Unable to load.</p>
      ) : checks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <UsersIcon className="w-8 h-8 mx-auto mb-2 text-border" />
          <p className="text-sm text-muted">
            No reference checks on file for {targetUserName}.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {checks.map((c) => {
            const MethodIcon = METHOD_META[c.method].icon;
            return (
              <li
                key={c.id}
                className="p-3 flex flex-wrap items-start gap-3 hover:bg-surface/50 cursor-pointer"
                onClick={() => setDetailFor(c)}
              >
                <div className="shrink-0 p-1.5 rounded-md border bg-blue-100 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800">
                  <MethodIcon className="w-4 h-4 text-blue-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {c.refereeName}
                    </span>
                    {c.recommendation && (
                      <span
                        className={cn(
                          "text-2xs uppercase font-semibold px-1.5 py-0.5 rounded border",
                          recommendationPill(c.recommendation),
                        )}
                      >
                        {RECOMMENDATION_LABEL[c.recommendation]}
                      </span>
                    )}
                    {c.redFlags && (
                      <span className="inline-flex items-center gap-0.5 text-2xs uppercase font-semibold px-1.5 py-0.5 rounded border bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
                        <CircleAlert className="w-3 h-3" />
                        Flag
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3">
                    <span>{c.refereeRelationship}</span>
                    {c.refereeOrganisation && (
                      <>
                        <span>·</span>
                        <span>{c.refereeOrganisation}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{METHOD_META[c.method].label}</span>
                    <span>·</span>
                    <span>
                      {c.contactedAt
                        ? `Contacted ${formatDate(c.contactedAt)}`
                        : "Not yet contacted"}
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium",
                    statusPill(c.status),
                  )}
                >
                  {STATUS_LABEL[c.status]}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {createOpen && (
        <RefCheckModal
          mode="create"
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {detailFor && (
        <RefCheckModal
          mode="edit"
          existing={detailFor}
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          isOwner={isOwner}
          onClose={() => setDetailFor(null)}
        />
      )}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────

interface RefCheckModalProps {
  mode: "create" | "edit";
  existing?: ReferenceCheck;
  targetUserId: string;
  targetUserName: string;
  isOwner?: boolean;
  onClose: () => void;
}

function RefCheckModal({
  mode,
  existing,
  targetUserId,
  targetUserName,
  isOwner = false,
  onClose,
}: RefCheckModalProps) {
  useEscapeClose(onClose);
  const qc = useQueryClient();
  const [refereeName, setRefereeName] = useState(existing?.refereeName ?? "");
  const [refereeRelationship, setRefereeRelationship] = useState(
    existing?.refereeRelationship ?? "",
  );
  const [refereeOrganisation, setRefereeOrganisation] = useState(
    existing?.refereeOrganisation ?? "",
  );
  const [refereePhone, setRefereePhone] = useState(existing?.refereePhone ?? "");
  const [refereeEmail, setRefereeEmail] = useState(existing?.refereeEmail ?? "");
  const [method, setMethod] = useState<RefMethod>(existing?.method ?? "phone");
  const [contactedAt, setContactedAt] = useState(
    existing?.contactedAt ? existing.contactedAt.slice(0, 10) : "",
  );
  const [status, setStatus] = useState<RefStatus>(existing?.status ?? "pending");
  const [recommendation, setRecommendation] = useState<RefRecommendation | "">(
    existing?.recommendation ?? "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [redFlags, setRedFlags] = useState(existing?.redFlags ?? "");
  const [employmentVerified, setEmploymentVerified] = useState<
    "" | "yes" | "no"
  >(
    existing?.employmentVerified === true
      ? "yes"
      : existing?.employmentVerified === false
        ? "no"
        : "",
  );
  const [wouldRehire, setWouldRehire] = useState<"" | "yes" | "no">(
    existing?.wouldRehire === true
      ? "yes"
      : existing?.wouldRehire === false
        ? "no"
        : "",
  );

  const save = useMutation({
    mutationFn: () => {
      const body = {
        userId: targetUserId,
        refereeName: refereeName.trim(),
        refereeRelationship: refereeRelationship.trim(),
        refereeOrganisation: refereeOrganisation.trim() || null,
        refereePhone: refereePhone.trim() || null,
        refereeEmail: refereeEmail.trim() || null,
        method,
        contactedAt: contactedAt
          ? new Date(contactedAt).toISOString()
          : null,
        status,
        recommendation: recommendation || null,
        notes: notes.trim(),
        redFlags: redFlags.trim() || null,
        employmentVerified:
          employmentVerified === "" ? null : employmentVerified === "yes",
        wouldRehire:
          wouldRehire === "" ? null : wouldRehire === "yes",
      };
      if (mode === "create") {
        return mutateApi("/api/reference-checks", {
          method: "POST",
          body,
        });
      }
      return mutateApi(`/api/reference-checks/${existing!.id}`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference-checks", targetUserId] });
      toast({
        description: mode === "create" ? "Reference check created." : "Updated.",
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const del = useMutation({
    mutationFn: () =>
      mutateApi(`/api/reference-checks/${existing!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reference-checks", targetUserId] });
      toast({ description: "Reference check removed (soft-deleted)." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const handleDelete = () => {
    if (
      !window.confirm(
        "Soft-delete this reference check? Hidden from the UI but retained 7 years per Fair Work record-keeping. Owner only.",
      )
    )
      return;
    del.mutate();
  };

  const canSave =
    !!refereeName.trim() &&
    !!refereeRelationship.trim() &&
    !!notes.trim() &&
    !save.isPending;

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
              {mode === "create" ? "New reference check" : "Reference check"} ·{" "}
              {targetUserName}
            </h2>
            {existing && (
              <p className="text-xs text-muted mt-0.5">
                Added {formatDate(existing.createdAt)} by{" "}
                {existing.checkedBy.name}
              </p>
            )}
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

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Referee name">
              <input
                type="text"
                value={refereeName}
                onChange={(e) => setRefereeName(e.target.value)}
                maxLength={200}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Relationship">
              <input
                type="text"
                value={refereeRelationship}
                onChange={(e) => setRefereeRelationship(e.target.value)}
                maxLength={200}
                disabled={save.isPending}
                placeholder="e.g. Former direct manager"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Organisation (optional)">
              <input
                type="text"
                value={refereeOrganisation}
                onChange={(e) => setRefereeOrganisation(e.target.value)}
                maxLength={200}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Method">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as RefMethod)}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                {(Object.keys(METHOD_META) as RefMethod[]).map((k) => (
                  <option key={k} value={k}>
                    {METHOD_META[k].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone (optional)">
              <input
                type="tel"
                value={refereePhone}
                onChange={(e) => setRefereePhone(e.target.value)}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Email (optional)">
              <input
                type="email"
                value={refereeEmail}
                onChange={(e) => setRefereeEmail(e.target.value)}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Contacted on">
              <input
                type="date"
                value={contactedAt}
                onChange={(e) => setContactedAt(e.target.value)}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RefStatus)}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                {(Object.keys(STATUS_LABEL) as RefStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {STATUS_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Recommendation">
              <select
                value={recommendation}
                onChange={(e) =>
                  setRecommendation(e.target.value as RefRecommendation | "")
                }
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="">— Not assessed —</option>
                {(Object.keys(RECOMMENDATION_LABEL) as RefRecommendation[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {RECOMMENDATION_LABEL[k]}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </div>

          <Field label="Notes — what was asked and what was said">
            <textarea
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={save.isPending}
              placeholder="Q: …\nA: …\n\nDocument the conversation. Be specific — paraphrase, don't editorialise."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
            />
          </Field>
          <Field label="Red flags (optional)">
            <textarea
              rows={3}
              value={redFlags}
              onChange={(e) => setRedFlags(e.target.value)}
              disabled={save.isPending}
              placeholder="Any specific concerns raised — gaps in employment, behavioural issues, performance concerns. Triggers the red flag pill on the row."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Confirmed employment dates">
              <select
                value={employmentVerified}
                onChange={(e) =>
                  setEmploymentVerified(e.target.value as "" | "yes" | "no")
                }
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="">— Not asked —</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="Would re-hire?">
              <select
                value={wouldRehire}
                onChange={(e) =>
                  setWouldRehire(e.target.value as "" | "yes" | "no")
                }
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="">— Not asked —</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          </div>

          {/* Quick-glance icons for verified flags */}
          {(employmentVerified === "yes" || wouldRehire === "yes") && (
            <div className="flex items-center gap-3 text-xs text-emerald-700">
              {employmentVerified === "yes" && (
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3" />
                  Employment verified
                </span>
              )}
              {wouldRehire === "yes" && (
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3" />
                  Would re-hire
                </span>
              )}
            </div>
          )}
          {(employmentVerified === "no" || wouldRehire === "no") && (
            <div className="flex items-center gap-3 text-xs text-red-700">
              {employmentVerified === "no" && (
                <span className="inline-flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3" />
                  Employment NOT verified
                </span>
              )}
              {wouldRehire === "no" && (
                <span className="inline-flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3" />
                  Would NOT re-hire
                </span>
              )}
            </div>
          )}
        </div>

        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-between gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div>
            {mode === "edit" && isOwner && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={save.isPending || del.isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
              >
                {del.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Soft-delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
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
              disabled={!canSave}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "create" ? (
                <Plus className="w-4 h-4" />
              ) : (
                <Pencil className="w-4 h-4" />
              )}
              {mode === "create" ? "Create" : "Save"}
            </button>
          </div>
        </footer>
      </div>
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
      <label className="block text-sm font-medium text-foreground mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
