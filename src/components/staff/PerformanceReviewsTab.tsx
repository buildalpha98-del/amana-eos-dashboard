"use client";

/**
 * PerformanceReviewsTab — "Reviews" sub-tab in the Performance section.
 *
 * Phase 1: admins schedule cycles, fill manager assessment, set goals,
 * set rating, mark complete. Self-assessment + acknowledgement workflows
 * are wired at the API/schema level but not yet exposed to staff (My
 * Portal lands in phase 2).
 *
 * Admin-gated rendering — non-admin staff who somehow land here see an
 * empty state. (The Performance section parent already gates this.)
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Plus,
  Loader2,
  X,
  Pencil,
  Trash2,
  Star,
  CalendarClock,
  CheckCircle2,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

// ── Types (mirror the API) ───────────────────────────────────────────

type ReviewType = "probation" | "mid_year" | "annual" | "ad_hoc";

type ReviewStatus =
  | "scheduled"
  | "self_assessment"
  | "manager_review"
  | "awaiting_acknowledgement"
  | "completed"
  | "cancelled";

type ReviewRating =
  | "below_expectations"
  | "partially_meeting"
  | "meeting_expectations"
  | "exceeding_expectations"
  | "exceptional";

type GoalStatus =
  | "not_started"
  | "in_progress"
  | "achieved"
  | "not_achieved"
  | "deferred";

interface ReviewGoal {
  id: string;
  reviewId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: GoalStatus;
  progressNotes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface PerformanceReview {
  id: string;
  userId: string;
  reviewerUserId: string | null;
  reviewer: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  type: ReviewType;
  status: ReviewStatus;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  selfAssessment: string | null;
  selfStrengths: string | null;
  selfImprovements: string | null;
  selfSubmittedAt: string | null;
  managerAssessment: string | null;
  managerStrengths: string | null;
  managerImprovements: string | null;
  managerSubmittedAt: string | null;
  overallRating: ReviewRating | null;
  acknowledgedAt: string | null;
  acknowledgementNotes: string | null;
  privateNotes: string | null;
  completedAt: string | null;
  goals: ReviewGoal[];
  createdAt: string;
  updatedAt: string;
}

interface DirectoryUser {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

// ── Visual config ────────────────────────────────────────────────────

const TYPE_LABEL: Record<ReviewType, string> = {
  probation: "Probation review",
  mid_year: "Mid-year check-in",
  annual: "Annual review",
  ad_hoc: "Ad-hoc review",
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  scheduled: "Scheduled",
  self_assessment: "Self-assessment",
  manager_review: "Manager review",
  awaiting_acknowledgement: "Awaiting acknowledgement",
  completed: "Completed",
  cancelled: "Cancelled",
};

const RATING_LABEL: Record<ReviewRating, string> = {
  below_expectations: "Below expectations",
  partially_meeting: "Partially meeting",
  meeting_expectations: "Meeting expectations",
  exceeding_expectations: "Exceeding expectations",
  exceptional: "Exceptional",
};

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  achieved: "Achieved",
  not_achieved: "Not achieved",
  deferred: "Deferred",
};

function statusPill(s: ReviewStatus): string {
  switch (s) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "cancelled":
      return "bg-gray-50 text-gray-700 border-gray-200";
    case "awaiting_acknowledgement":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "manager_review":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "self_assessment":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function ratingPill(r: ReviewRating): string {
  switch (r) {
    case "exceptional":
    case "exceeding_expectations":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "meeting_expectations":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "partially_meeting":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "below_expectations":
      return "bg-red-50 text-red-700 border-red-200";
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Component ────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

export interface PerformanceReviewsTabProps {
  targetUserId: string;
  targetUserName: string;
  viewerRole: string;
}

export function PerformanceReviewsTab({
  targetUserId,
  targetUserName,
  viewerRole,
}: PerformanceReviewsTabProps) {
  const isAdmin = ADMIN_ROLES.has(viewerRole);
  const isOwner = viewerRole === "owner";

  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<
    { reviews: PerformanceReview[] },
    ApiResponseError
  >({
    queryKey: ["performance-reviews", targetUserId],
    queryFn: () =>
      fetchApi(
        `/api/performance-reviews?userId=${encodeURIComponent(targetUserId)}`,
      ),
    staleTime: 30_000,
  });

  const reviews = data?.reviews ?? [];
  const detail = useMemo(
    () => (editId ? reviews.find((r) => r.id === editId) ?? null : null),
    [editId, reviews],
  );

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted italic">
        Performance reviews are admin-only. Staff will see their own
        reviews on the My Portal in a future release.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Scheduled review cycles for {targetUserName}. Set the period,
          assign the reviewer, capture the manager assessment and goals.
          Records are retained 7 years per Fair Work record-keeping.
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors shrink-0"
          data-testid="performance-review-add"
        >
          <Plus className="w-4 h-4" />
          Schedule review
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading reviews…</p>
      ) : error ? (
        <p className="text-sm text-red-600">
          Unable to load reviews. Please refresh.
        </p>
      ) : reviews.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Award className="w-8 h-8 mx-auto mb-2 text-border" />
          <p className="text-sm text-muted">
            No reviews scheduled for {targetUserName} yet.
          </p>
          <p className="text-xs text-muted mt-1">
            Schedule a probation review (~75 days after start) or an
            annual cycle to begin.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="p-3 flex flex-wrap items-start gap-3 hover:bg-surface/50 cursor-pointer"
              onClick={() => setEditId(r.id)}
              data-testid={`performance-review-${r.id}`}
            >
              <div className="shrink-0 p-1.5 rounded-md border bg-orange-100 border-orange-200">
                <Award className="w-4 h-4 text-orange-700" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {TYPE_LABEL[r.type]}
                  </span>
                  {r.overallRating && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border",
                        ratingPill(r.overallRating),
                      )}
                    >
                      <Star className="w-3 h-3" />
                      {RATING_LABEL[r.overallRating]}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    Period {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    Due {formatDate(r.dueDate)}
                  </span>
                  {r.reviewer && (
                    <>
                      <span>·</span>
                      <span>Reviewer: {r.reviewer.name}</span>
                    </>
                  )}
                  {r.goals.length > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        {r.goals.length} goal{r.goals.length === 1 ? "" : "s"}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium",
                  statusPill(r.status),
                )}
              >
                {STATUS_LABEL[r.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <CreateReviewModal
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {detail && (
        <EditReviewModal
          review={detail}
          targetUserName={targetUserName}
          isOwner={isOwner}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  );
}

// ── Create modal ─────────────────────────────────────────────────────

interface CreateReviewModalProps {
  targetUserId: string;
  targetUserName: string;
  onClose: () => void;
}

function CreateReviewModal({
  targetUserId,
  targetUserName,
  onClose,
}: CreateReviewModalProps) {
  const qc = useQueryClient();
  const [type, setType] = useState<ReviewType>("annual");
  const [periodStart, setPeriodStart] = useState(addDaysISO(todayISO(), -365));
  const [periodEnd, setPeriodEnd] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), 14));
  const [reviewerUserId, setReviewerUserId] = useState<string>("");
  const [privateNotes, setPrivateNotes] = useState("");

  const { data: users } = useQuery<DirectoryUser[], ApiResponseError>({
    queryKey: ["users-directory-active"],
    queryFn: () => fetchApi("/api/users?active=true"),
    staleTime: 5 * 60_000,
  });

  // Filter to plausible reviewers — exclude the subject themselves and
  // inactive users. Most reviewers will be owner/head_office/admin/member
  // but we don't enforce — admins know their org.
  const reviewers = useMemo(
    () =>
      (users ?? [])
        .filter((u) => u.id !== targetUserId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users, targetUserId],
  );

  const submit = useMutation({
    mutationFn: () =>
      mutateApi("/api/performance-reviews", {
        method: "POST",
        body: {
          userId: targetUserId,
          reviewerUserId: reviewerUserId || null,
          type,
          periodStart,
          periodEnd,
          dueDate,
          privateNotes: privateNotes.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["performance-reviews", targetUserId],
      });
      toast({ description: "Review scheduled." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const canSubmit =
    !!periodStart &&
    !!periodEnd &&
    !!dueDate &&
    periodEnd >= periodStart &&
    dueDate >= periodEnd &&
    !submit.isPending;

  // When user changes the type, pre-fill plausible dates.
  function selectType(next: ReviewType) {
    setType(next);
    const today = todayISO();
    if (next === "probation") {
      setPeriodStart(addDaysISO(today, -75));
      setPeriodEnd(today);
      setDueDate(addDaysISO(today, 7));
    } else if (next === "annual") {
      setPeriodStart(addDaysISO(today, -365));
      setPeriodEnd(today);
      setDueDate(addDaysISO(today, 14));
    } else if (next === "mid_year") {
      setPeriodStart(addDaysISO(today, -183));
      setPeriodEnd(today);
      setDueDate(addDaysISO(today, 7));
    } else {
      setPeriodStart(addDaysISO(today, -30));
      setPeriodEnd(today);
      setDueDate(addDaysISO(today, 7));
    }
  }

  return (
    <ModalShell
      title={`Schedule review · ${targetUserName}`}
      onClose={onClose}
      disabled={submit.isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submit.isPending}
            className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-md border border-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
          >
            {submit.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Schedule
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => selectType(e.target.value as ReviewType)}
            disabled={submit.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reviewer (optional)">
          <select
            value={reviewerUserId}
            onChange={(e) => setReviewerUserId(e.target.value)}
            disabled={submit.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="">— Choose reviewer —</option>
            {reviewers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Period start">
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            disabled={submit.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Period end">
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            disabled={submit.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Due">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={submit.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <Field label="Private notes (admin-only, optional)">
        <textarea
          rows={3}
          value={privateNotes}
          onChange={(e) => setPrivateNotes(e.target.value)}
          disabled={submit.isPending}
          placeholder="Context for HR — never shown to the subject."
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </Field>
    </ModalShell>
  );
}

// ── Edit modal ───────────────────────────────────────────────────────

interface EditReviewModalProps {
  review: PerformanceReview;
  targetUserName: string;
  isOwner: boolean;
  onClose: () => void;
}

interface GoalDraft {
  id?: string;
  title: string;
  description: string;
  dueDate: string;
  status: GoalStatus;
  progressNotes: string;
  sortOrder: number;
}

function EditReviewModal({
  review,
  targetUserName,
  isOwner,
  onClose,
}: EditReviewModalProps) {
  const qc = useQueryClient();
  const [reviewerUserId, setReviewerUserId] = useState(
    review.reviewerUserId ?? "",
  );
  const [periodStart, setPeriodStart] = useState(review.periodStart.slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(review.periodEnd.slice(0, 10));
  const [dueDate, setDueDate] = useState(review.dueDate.slice(0, 10));
  const [status, setStatus] = useState<ReviewStatus>(review.status);
  const [managerAssessment, setManagerAssessment] = useState(
    review.managerAssessment ?? "",
  );
  const [managerStrengths, setManagerStrengths] = useState(
    review.managerStrengths ?? "",
  );
  const [managerImprovements, setManagerImprovements] = useState(
    review.managerImprovements ?? "",
  );
  const [overallRating, setOverallRating] = useState<ReviewRating | "">(
    review.overallRating ?? "",
  );
  const [privateNotes, setPrivateNotes] = useState(review.privateNotes ?? "");
  const [goals, setGoals] = useState<GoalDraft[]>(
    review.goals.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description ?? "",
      dueDate: g.dueDate ? g.dueDate.slice(0, 10) : "",
      status: g.status,
      progressNotes: g.progressNotes ?? "",
      sortOrder: g.sortOrder,
    })),
  );

  const { data: users } = useQuery<DirectoryUser[], ApiResponseError>({
    queryKey: ["users-directory-active"],
    queryFn: () => fetchApi("/api/users?active=true"),
    staleTime: 5 * 60_000,
  });

  const reviewers = useMemo(
    () =>
      (users ?? [])
        .filter((u) => u.id !== review.userId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users, review.userId],
  );

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        reviewerUserId: reviewerUserId || null,
        periodStart,
        periodEnd,
        dueDate,
        status,
        managerAssessment: managerAssessment.trim() || null,
        managerStrengths: managerStrengths.trim() || null,
        managerImprovements: managerImprovements.trim() || null,
        overallRating: overallRating || null,
        privateNotes: privateNotes.trim() || null,
        goals: goals
          .filter((g) => g.title.trim())
          .map((g) => ({
            id: g.id,
            title: g.title.trim(),
            description: g.description.trim() || null,
            dueDate: g.dueDate || null,
            status: g.status,
            progressNotes: g.progressNotes.trim() || null,
            sortOrder: g.sortOrder,
          })),
      };
      return mutateApi(`/api/performance-reviews/${review.id}`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["performance-reviews", review.userId],
      });
      toast({ description: "Review updated." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const del = useMutation({
    mutationFn: () =>
      mutateApi(`/api/performance-reviews/${review.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["performance-reviews", review.userId],
      });
      toast({
        description: "Review removed (soft-deleted, retained 7 years).",
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const handleDelete = () => {
    if (
      !window.confirm(
        "Soft-delete this review? Hidden from the UI but retained 7 years per Fair Work record-keeping. Owner only.",
      )
    )
      return;
    del.mutate();
  };

  const canSave =
    !!periodStart &&
    !!periodEnd &&
    !!dueDate &&
    periodEnd >= periodStart &&
    dueDate >= periodEnd &&
    !save.isPending;

  function addGoal() {
    setGoals((gs) => [
      ...gs,
      {
        title: "",
        description: "",
        dueDate: "",
        status: "not_started",
        progressNotes: "",
        sortOrder: gs.length,
      },
    ]);
  }

  function updateGoal(idx: number, patch: Partial<GoalDraft>) {
    setGoals((gs) => gs.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }

  function removeGoal(idx: number) {
    setGoals((gs) => gs.filter((_, i) => i !== idx));
  }

  return (
    <ModalShell
      title={`${TYPE_LABEL[review.type]} · ${targetUserName}`}
      subtitle={`Created ${formatDate(review.createdAt)} by ${review.createdBy.name}`}
      onClose={onClose}
      disabled={save.isPending}
      footer={
        <>
          <div>
            {isOwner && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={save.isPending || del.isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
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
              ) : (
                <Pencil className="w-4 h-4" />
              )}
              Save changes
            </button>
          </div>
        </>
      }
      splitFooter
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Reviewer">
          <select
            value={reviewerUserId}
            onChange={(e) => setReviewerUserId(e.target.value)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="">— Unassigned —</option>
            {reviewers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ReviewStatus)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Period start">
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Period end">
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Due">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <Field label="Overall rating (optional)">
        <select
          value={overallRating}
          onChange={(e) =>
            setOverallRating(e.target.value as ReviewRating | "")
          }
          disabled={save.isPending}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">— No rating —</option>
          {Object.entries(RATING_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>

      {/* Self-assessment (read-only here in phase 1 — staff fills it
          via My Portal in phase 2; admin sees what they wrote.) */}
      {(review.selfAssessment ||
        review.selfStrengths ||
        review.selfImprovements) && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
            <CheckCircle2 className="w-4 h-4" />
            Self-assessment {review.selfSubmittedAt && (
              <span className="text-xs font-normal text-muted">
                · submitted {formatDate(review.selfSubmittedAt)}
              </span>
            )}
          </div>
          {review.selfAssessment && (
            <ReadOnlyText label="Self assessment" value={review.selfAssessment} />
          )}
          {review.selfStrengths && (
            <ReadOnlyText label="Strengths" value={review.selfStrengths} />
          )}
          {review.selfImprovements && (
            <ReadOnlyText
              label="Areas to develop"
              value={review.selfImprovements}
            />
          )}
        </div>
      )}

      <Field label="Manager assessment">
        <textarea
          rows={5}
          value={managerAssessment}
          onChange={(e) => setManagerAssessment(e.target.value)}
          disabled={save.isPending}
          placeholder="Overall assessment of the review period. Specific examples, behaviours, outcomes."
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Strengths">
          <textarea
            rows={4}
            value={managerStrengths}
            onChange={(e) => setManagerStrengths(e.target.value)}
            disabled={save.isPending}
            placeholder="What's working well."
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Areas to develop">
          <textarea
            rows={4}
            value={managerImprovements}
            onChange={(e) => setManagerImprovements(e.target.value)}
            disabled={save.isPending}
            placeholder="Where there's room to grow."
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {/* Goals */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-foreground">
            Goals for next period
          </label>
          <button
            type="button"
            onClick={addGoal}
            disabled={save.isPending || goals.length >= 20}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-foreground border border-border rounded-md hover:bg-surface disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Add goal
          </button>
        </div>
        {goals.length === 0 ? (
          <p className="text-xs text-muted italic">
            No goals yet. Goals carry forward to the next review cycle.
          </p>
        ) : (
          <ul className="space-y-2">
            {goals.map((g, idx) => (
              <li
                key={g.id ?? `new-${idx}`}
                className="rounded-md border border-border p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    value={g.title}
                    onChange={(e) =>
                      updateGoal(idx, { title: e.target.value })
                    }
                    disabled={save.isPending}
                    placeholder="Goal title"
                    maxLength={200}
                    className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => removeGoal(idx)}
                    disabled={save.isPending}
                    className="shrink-0 p-1.5 rounded-md text-red-700 hover:bg-red-50 disabled:opacity-50"
                    aria-label="Remove goal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-muted mb-0.5">
                      Status
                    </label>
                    <select
                      value={g.status}
                      onChange={(e) =>
                        updateGoal(idx, {
                          status: e.target.value as GoalStatus,
                        })
                      }
                      disabled={save.isPending}
                      className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
                    >
                      {Object.entries(GOAL_STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-0.5">
                      Target date (optional)
                    </label>
                    <input
                      type="date"
                      value={g.dueDate}
                      onChange={(e) =>
                        updateGoal(idx, { dueDate: e.target.value })
                      }
                      disabled={save.isPending}
                      className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
                    />
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={g.description}
                  onChange={(e) =>
                    updateGoal(idx, { description: e.target.value })
                  }
                  disabled={save.isPending}
                  placeholder="Description / how we'll know it's done"
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
                />
                {g.id && (
                  <textarea
                    rows={2}
                    value={g.progressNotes}
                    onChange={(e) =>
                      updateGoal(idx, { progressNotes: e.target.value })
                    }
                    disabled={save.isPending}
                    placeholder="Progress notes (running)"
                    className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Field label="Private HR notes (admin-only)">
        <textarea
          rows={3}
          value={privateNotes}
          onChange={(e) => setPrivateNotes(e.target.value)}
          disabled={save.isPending}
          placeholder="Never shown to the subject. Use for risk flags, succession notes, etc."
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </Field>

      {review.acknowledgedAt && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
          <div className="font-medium text-emerald-900 inline-flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            Acknowledged {formatDate(review.acknowledgedAt)}
          </div>
          {review.acknowledgementNotes && (
            <p className="text-xs text-emerald-900/80 mt-1 whitespace-pre-wrap">
              {review.acknowledgementNotes}
            </p>
          )}
        </div>
      )}
    </ModalShell>
  );
}

// ── Modal shell helpers ──────────────────────────────────────────────

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  disabled: boolean;
  footer: React.ReactNode;
  children: React.ReactNode;
  splitFooter?: boolean;
}

function ModalShell({
  title,
  subtitle,
  onClose,
  disabled,
  footer,
  children,
  splitFooter,
}: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !disabled) onClose();
      }}
    >
      <div
        className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-2xl flex flex-col shadow-2xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>

        <footer
          className={cn(
            "border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center gap-2",
            splitFooter ? "justify-between" : "justify-end",
          )}
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {footer}
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

function ReadOnlyText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-blue-900/70">{label}</div>
      <p className="text-xs text-blue-900 whitespace-pre-wrap mt-0.5">
        {value}
      </p>
    </div>
  );
}
