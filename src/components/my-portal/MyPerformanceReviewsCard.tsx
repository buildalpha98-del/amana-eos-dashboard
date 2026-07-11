"use client";

/**
 * MyPerformanceReviewsCard — staff view of their own performance reviews.
 *
 * Phase 2 of the performance review framework (phase 1 shipped admin
 * scheduling + assessment). Staff see their own cycles, complete the
 * self-assessment when prompted, and acknowledge the manager's review
 * once it's submitted.
 *
 * The card stays quiet when the user has no reviews — no awkward "no
 * reviews yet" block on the portal. As soon as one is scheduled it
 * appears with a clear call-to-action when action is required.
 *
 * Visibility / security: the endpoint enforces "subject must be caller"
 * for non-admin roles, and strips `privateNotes` on the server. The
 * UI doesn't render privateNotes at all, defence-in-depth.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Star,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

// ── Types (mirror server) ────────────────────────────────────────────

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
  title: string;
  description: string | null;
  dueDate: string | null;
  status: GoalStatus;
  progressNotes: string | null;
  sortOrder: number;
}

interface PerformanceReview {
  id: string;
  userId: string;
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
  completedAt: string | null;
  goals: ReviewGoal[];
}

const TYPE_LABEL: Record<ReviewType, string> = {
  probation: "Probation review",
  mid_year: "Mid-year check-in",
  annual: "Annual review",
  ad_hoc: "Ad-hoc review",
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  scheduled: "Scheduled",
  self_assessment: "Self-assessment open",
  manager_review: "With your manager",
  awaiting_acknowledgement: "Awaiting your acknowledgement",
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
    case "self_assessment":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "awaiting_acknowledgement":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "cancelled":
      return "bg-surface text-foreground/80 border-border";
    case "manager_review":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-surface text-foreground/80 border-border";
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

// Reviews where the staff member needs to do something now. Sort to the
// top of the card so the call-to-action dominates.
function isActionRequired(r: PerformanceReview): boolean {
  return (
    r.status === "self_assessment" || r.status === "awaiting_acknowledgement"
  );
}

// ── Component ────────────────────────────────────────────────────────

export function MyPerformanceReviewsCard() {
  const { data, isLoading, error } = useQuery<
    { reviews: PerformanceReview[] },
    ApiResponseError
  >({
    queryKey: ["my-performance-reviews"],
    queryFn: () => fetchApi("/api/performance-reviews?mine=1"),
    staleTime: 60_000,
  });

  // Hide the card entirely when there's no data and nothing's loading —
  // most staff won't have a review at all times. Don't pollute the portal.
  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 animate-pulse">
        <div className="h-5 w-48 bg-border rounded mb-4" />
        <div className="h-16 bg-border/50 rounded" />
      </div>
    );
  }

  if (error || !data || data.reviews.length === 0) {
    return null;
  }

  // Sort: action-required first, then most-recent due date.
  const reviews = [...data.reviews].sort((a, b) => {
    const aAction = isActionRequired(a);
    const bAction = isActionRequired(b);
    if (aAction !== bAction) return aAction ? -1 : 1;
    return b.dueDate.localeCompare(a.dueDate);
  });

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Award className="w-5 h-5 text-orange-500" />
          My Performance Reviews
        </h3>
        {reviews.some(isActionRequired) && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            Action required
          </span>
        )}
      </div>
      <ul className="space-y-3">
        {reviews.map((r) => (
          <ReviewRow key={r.id} review={r} />
        ))}
      </ul>
    </div>
  );
}

// ── Single review row + inline expansion ─────────────────────────────

function ReviewRow({ review }: { review: PerformanceReview }) {
  const [expanded, setExpanded] = useState(isActionRequired(review));

  return (
    <li
      className={cn(
        "rounded-lg border",
        isActionRequired(review)
          ? "border-amber-300 bg-amber-50/30"
          : "border-border/60",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex flex-wrap items-start gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <div className="shrink-0 p-1.5 rounded-md border bg-orange-100 border-orange-200">
          <Award className="w-4 h-4 text-orange-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {TYPE_LABEL[review.type]}
            </span>
            {review.overallRating && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-2xs font-semibold uppercase px-1.5 py-0.5 rounded border",
                  ratingPill(review.overallRating),
                )}
              >
                <Star className="w-3 h-3" />
                {RATING_LABEL[review.overallRating]}
              </span>
            )}
          </div>
          <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>
              Period {formatDate(review.periodStart)} →{" "}
              {formatDate(review.periodEnd)}
            </span>
            {review.reviewer && (
              <>
                <span>·</span>
                <span>Reviewer: {review.reviewer.name}</span>
              </>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Due {formatDate(review.dueDate)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium",
              statusPill(review.status),
            )}
          >
            {STATUS_LABEL[review.status]}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border/60 mt-1">
          <ReviewBody review={review} />
        </div>
      )}
    </li>
  );
}

function ReviewBody({ review }: { review: PerformanceReview }) {
  if (review.status === "self_assessment") {
    return <SelfAssessmentForm review={review} />;
  }
  if (review.status === "awaiting_acknowledgement") {
    return <AcknowledgementForm review={review} />;
  }
  return <ReviewReadOnly review={review} />;
}

// ── Self-assessment form ────────────────────────────────────────────

function SelfAssessmentForm({ review }: { review: PerformanceReview }) {
  const qc = useQueryClient();
  const [assessment, setAssessment] = useState(review.selfAssessment ?? "");
  const [strengths, setStrengths] = useState(review.selfStrengths ?? "");
  const [improvements, setImprovements] = useState(
    review.selfImprovements ?? "",
  );

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      mutateApi(`/api/performance-reviews/${review.id}`, {
        method: "PATCH",
        body: {
          selfAssessment: assessment.trim() || null,
          selfStrengths: strengths.trim() || null,
          selfImprovements: improvements.trim() || null,
          ...(submit ? { submitSelfAssessment: true } : {}),
        },
      }),
    onSuccess: (_, submit) => {
      qc.invalidateQueries({ queryKey: ["my-performance-reviews"] });
      toast({
        description: submit
          ? "Self-assessment submitted to your manager."
          : "Draft saved.",
      });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const canSubmit = assessment.trim().length > 0 && !save.isPending;

  return (
    <div className="space-y-3 pt-3">
      <p className="text-sm text-muted">
        Take a moment to reflect on the period{" "}
        <span className="font-medium text-foreground">
          {formatDate(review.periodStart)} → {formatDate(review.periodEnd)}
        </span>
        . Your manager will read this before writing their own assessment.
      </p>

      <PortalField label="Self assessment">
        <textarea
          rows={5}
          value={assessment}
          onChange={(e) => setAssessment(e.target.value)}
          disabled={save.isPending}
          placeholder="What went well, what was challenging, what you achieved."
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </PortalField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PortalField label="Strengths">
          <textarea
            rows={4}
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            disabled={save.isPending}
            placeholder="Where you feel you're doing well."
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </PortalField>
        <PortalField label="Areas to develop">
          <textarea
            rows={4}
            value={improvements}
            onChange={(e) => setImprovements(e.target.value)}
            disabled={save.isPending}
            placeholder="Where you'd like to grow."
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </PortalField>
      </div>

      {review.goals.length > 0 && (
        <div className="rounded-md border border-border bg-surface/40 p-3">
          <p className="text-xs font-semibold text-foreground/80 mb-1.5">
            Goals from your last review
          </p>
          <ul className="space-y-1 text-xs text-muted">
            {review.goals.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{g.title}</span>
                <span className="text-2xs uppercase tracking-wide px-1.5 py-0.5 rounded border bg-card">
                  {GOAL_STATUS_LABEL[g.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => save.mutate(false)}
          disabled={save.isPending}
          className="px-3 py-2 text-sm font-medium text-foreground border border-border rounded-md hover:bg-surface disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          type="button"
          onClick={() => save.mutate(true)}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand-hover disabled:opacity-50"
        >
          {save.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Submit to manager
        </button>
        <p className="text-xs text-muted">
          You can keep editing while in draft. Once submitted, your manager
          will write their assessment.
        </p>
      </div>
    </div>
  );
}

// ── Acknowledgement form ─────────────────────────────────────────────

function AcknowledgementForm({ review }: { review: PerformanceReview }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const ack = useMutation({
    mutationFn: () =>
      mutateApi(`/api/performance-reviews/${review.id}`, {
        method: "PATCH",
        body: {
          acknowledge: true,
          acknowledgementNotes: notes.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-performance-reviews"] });
      toast({ description: "Review acknowledged." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  return (
    <div className="space-y-3 pt-3">
      <ManagerAssessmentBlock review={review} />

      <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <p className="text-sm font-medium text-amber-900">
          Your acknowledgement
        </p>
        <p className="text-xs text-amber-900/80">
          Acknowledging confirms you've read your manager&apos;s assessment.
          It doesn&apos;t mean you have to agree — use the notes field if you
          want to record a different view.
        </p>
        <PortalField label="Notes (optional)">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={ack.isPending}
            placeholder="Anything you'd like to add or note for the record."
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </PortalField>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={ack.isPending}
            className="mt-1"
          />
          <span className="text-sm text-foreground/80">
            I confirm I&apos;ve read and understood my manager&apos;s
            assessment.
          </span>
        </label>
        <button
          type="button"
          onClick={() => ack.mutate()}
          disabled={!confirmed || ack.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand-hover disabled:opacity-50"
        >
          {ack.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Acknowledge review
        </button>
      </div>
    </div>
  );
}

// ── Read-only summary (scheduled / manager_review / completed) ───────

function ReviewReadOnly({ review }: { review: PerformanceReview }) {
  const showManagerAssessment =
    review.status === "completed" && review.managerAssessment;
  const showAck =
    review.status === "completed" && review.acknowledgedAt;

  return (
    <div className="space-y-3 pt-3">
      {review.status === "scheduled" && (
        <p className="text-sm text-muted">
          Scheduled by {review.createdBy.name}. We&apos;ll let you know when
          the self-assessment opens.
        </p>
      )}
      {review.status === "manager_review" && (
        <>
          <p className="text-sm text-muted">
            Your self-assessment has been submitted. Your manager is writing
            their assessment now.
          </p>
          {review.selfAssessment && (
            <div className="rounded-md border border-border bg-surface/40 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-foreground/80">
                Your submission
              </p>
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
        </>
      )}
      {showManagerAssessment && <ManagerAssessmentBlock review={review} />}
      {review.goals.length > 0 && (
        <GoalsList goals={review.goals} />
      )}
      {showAck && (
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
    </div>
  );
}

function ManagerAssessmentBlock({ review }: { review: PerformanceReview }) {
  if (
    !review.managerAssessment &&
    !review.managerStrengths &&
    !review.managerImprovements
  ) {
    return null;
  }
  return (
    <div className="rounded-md border border-purple-200 bg-purple-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-purple-900 inline-flex items-center gap-1.5">
          <Award className="w-4 h-4" />
          Manager assessment
          {review.reviewer && (
            <span className="text-xs font-normal text-purple-900/70">
              · {review.reviewer.name}
            </span>
          )}
        </p>
        {review.overallRating && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-2xs font-semibold uppercase px-1.5 py-0.5 rounded border",
              ratingPill(review.overallRating),
            )}
          >
            <Star className="w-3 h-3" />
            {RATING_LABEL[review.overallRating]}
          </span>
        )}
      </div>
      {review.managerAssessment && (
        <ReadOnlyText
          label="Assessment"
          value={review.managerAssessment}
          tone="purple"
        />
      )}
      {review.managerStrengths && (
        <ReadOnlyText
          label="Strengths"
          value={review.managerStrengths}
          tone="purple"
        />
      )}
      {review.managerImprovements && (
        <ReadOnlyText
          label="Areas to develop"
          value={review.managerImprovements}
          tone="purple"
        />
      )}
    </div>
  );
}

function GoalsList({ goals }: { goals: ReviewGoal[] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-semibold text-foreground/80 mb-2">Goals</p>
      <ul className="space-y-2">
        {goals.map((g) => (
          <li key={g.id} className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{g.title}</span>
              <span className="text-2xs uppercase tracking-wide px-1.5 py-0.5 rounded border bg-card text-muted">
                {GOAL_STATUS_LABEL[g.status]}
              </span>
              {g.dueDate && (
                <span className="text-xs text-muted">
                  Target {formatDate(g.dueDate)}
                </span>
              )}
            </div>
            {g.description && (
              <p className="text-xs text-muted mt-0.5 whitespace-pre-wrap">
                {g.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Shared field/text helpers ────────────────────────────────────────

function PortalField({
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

function ReadOnlyText({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "purple";
}) {
  const labelClass =
    tone === "purple" ? "text-purple-900/70" : "text-foreground/70";
  const valueClass =
    tone === "purple" ? "text-purple-900" : "text-foreground";
  return (
    <div>
      <div className={cn("text-xs font-medium", labelClass)}>{label}</div>
      <p className={cn("text-xs whitespace-pre-wrap mt-0.5", valueClass)}>
        {value}
      </p>
    </div>
  );
}
