"use client";

import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMyPortal } from "@/hooks/useMyPortal";
import {
  Mail,
  Phone,
  Building2,
  Calendar,
  Briefcase,
  Clock,
  AlertTriangle,
  ChevronRight,
  FileText,
  ShieldCheck,
  UserCircle,
  X,
  CircleDot,
  CalendarDays,
  Loader2,
  ExternalLink,
  MessageSquare,
  Star,
  Send,
  Wallet,
  Receipt,
} from "lucide-react";
import { cn, toLocalIsoDate } from "@/lib/utils";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { Button } from "@/components/ui/Button";
import { MyClockCard, clockWindowRange } from "@/components/my-portal/MyClockCard";
import { MorningBriefCard } from "@/components/dashboard/MorningBriefCard";
import { useMyPayslips, formatCurrency } from "@/hooks/useMyPayslips";
import { useOrgConfig } from "@/hooks/useOrgConfig";
import { getRequiredCertTypes } from "@/lib/cert-requirements";
import { totalAmount, type ExpenseRequest } from "@/components/my-portal/MyExpensesCard";
import { CLOCK_IN_WINDOW_MS, shiftStartMs } from "@/lib/timeclock-pick";
import { MyPerformanceReviewsCard } from "@/components/my-portal/MyPerformanceReviewsCard";
import { PushOptInCard } from "@/components/notifications/PushOptInCard";
import { GetReadyChecklist } from "@/components/my-portal/GetReadyChecklist";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntilExpiry(expiryDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getFirstName(name: string): string {
  return name.split(" ")[0] || name;
}

const certTypeLabels: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  cpr: "CPR",
  police_check: "Police Check",
  annual_review: "Annual Review",
  other: "Other",
};


function formatEmploymentType(type: string | null | undefined): string {
  if (!type) return "Not specified";
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Skeleton Loader                                                     */
/* ------------------------------------------------------------------ */

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-border", className)} />
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Welcome header skeleton */}
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-72" />
        <SkeletonBlock className="h-4 w-48" />
      </div>

      {/* Profile card skeleton */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start gap-4">
          <SkeletonBlock className="w-16 h-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-56" />
            <SkeletonBlock className="h-4 w-32" />
          </div>
        </div>
      </div>

      {/* Leave balances skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4">
            <SkeletonBlock className="h-4 w-24 mb-2" />
            <SkeletonBlock className="h-8 w-16 mb-1" />
            <SkeletonBlock className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Contract skeleton */}
      <div className="bg-card rounded-xl border border-border p-6">
        <SkeletonBlock className="h-5 w-36 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-4 w-28" />
        </div>
      </div>

      {/* Compliance skeleton */}
      <div className="bg-card rounded-xl border border-border p-6">
        <SkeletonBlock className="h-5 w-48 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Policy Acknowledgement Modal                                        */
/* ------------------------------------------------------------------ */

function PolicyAckModal({
  policyTitle,
  isPending,
  onConfirm,
  onCancel,
}: {
  policyTitle: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  // Escape closes the dialog (unless the acknowledgement is in flight).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isPending, onCancel]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={() => {
        if (!isPending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-ack-title"
        className="bg-card rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h3 id="policy-ack-title" className="text-lg font-semibold text-foreground">
            Acknowledge Policy
          </h3>
          <button
            onClick={onCancel}
            disabled={isPending}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-800">
            <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900">{policyTitle}</p>
            </div>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            By clicking confirm below, you acknowledge that you have read and
            understood this policy and agree to abide by its terms.
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 w-4 h-4 accent-brand"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                if (e.target.checked) setShowValidation(false);
              }}
            />
            <span className="text-sm text-foreground/80 select-none">
              I have read and understood this policy
            </span>
          </label>
          {showValidation && (
            <p className="text-xs text-red-600 dark:text-red-400 font-medium" role="alert">
              Please tick the box to confirm you have read the policy.
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border/50">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!confirmed) {
                setShowValidation(true);
                return;
              }
              onConfirm();
            }}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? "Acknowledging..." : "Confirm Acknowledgement"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Home hub — next-shift hero, glance tiles, quick actions, attention  */
/* (Staff Portal v2 Task 1.6 — per Main.dc.html / MobileHome.dc.html)  */
/* ------------------------------------------------------------------ */

/**
 * Shared retry predicate for the EH-backed glance queries — mirrors the
 * destination pages exactly: 404 (not linked) and 503 (not configured)
 * are terminal, everything else retries twice.
 */
function terminalRetry(count: number, err: unknown): boolean {
  const status = (err as ApiResponseError)?.status;
  if (status === 404 || status === 503) return false;
  return count < 2;
}

interface HeroShift {
  id: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  service?: { id: string; name: string } | null;
}


/**
 * Next-shift / clock hero. MyClockCard renders itself (clock in/out,
 * ambiguous picker, error state) and hides entirely on a quiet day —
 * this wrapper subscribes to the SAME query (identical key + options,
 * so React Query dedupes) and, when the card's own hide predicate is
 * true, shows a compact next-shift line instead so the hero slot is
 * never just empty.
 */
function NextShiftHero({ userId }: { userId: string }) {
  const { from, to } = clockWindowRange();
  const { data, isSuccess } = useQuery<{ shifts: HeroShift[] }>({
    queryKey: ["my-shifts", userId, from, to],
    queryFn: () =>
      fetchApi<{ shifts: HeroShift[] }>(
        `/api/roster/shifts/mine?from=${from}&to=${to}`,
      ),
    enabled: !!userId,
    retry: 2,
    refetchInterval: 60_000,
  });

  const shifts = useMemo(() => data?.shifts ?? [], [data]);

  // Same minute-tick as MyClockCard, so the fallback line swaps out in
  // step with the card appearing when a shift enters its window.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Replicates MyClockCard's visibility predicate: active shift, or a
  // shift inside the ±2h clock-in window. (Ambiguous-candidate state
  // only arises after a clock-in attempt, which requires an eligible
  // shift — covered by the same predicate.)
  const clockCardVisible = useMemo(() => {
    const nowMs = now.getTime();
    return shifts.some((s) => {
      if (s.actualStart && !s.actualEnd) return true; // clocked in
      if (s.actualStart) return false;
      const startMs = shiftStartMs({
        id: s.id,
        date: new Date(s.date),
        shiftStart: s.shiftStart,
        shiftEnd: s.shiftEnd,
        actualStart: null,
        actualEnd: null,
      });
      return Math.abs(nowMs - startMs) <= CLOCK_IN_WINDOW_MS;
    });
  }, [shifts, now]);

  const nextShift = useMemo(() => {
    const today = toLocalIsoDate(now);
    return (
      shifts
        .filter(
          (s) => !s.actualStart && toLocalIsoDate(new Date(s.date)) >= today,
        )
        .sort((a, b) =>
          `${toLocalIsoDate(new Date(a.date))}T${a.shiftStart}`.localeCompare(
            `${toLocalIsoDate(new Date(b.date))}T${b.shiftStart}`,
          ),
        )[0] ?? null
    );
  }, [shifts, now]);

  return (
    <div data-testid="next-shift-hero">
      <MyClockCard userId={userId} />
      {isSuccess && !clockCardVisible && (
        <Link
          href="/my-day"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-brand/30 transition-colors"
          data-testid="next-shift-line"
        >
          <Clock className="w-4 h-4 text-brand flex-shrink-0" aria-hidden />
          {nextShift ? (
            <span className="text-sm text-foreground min-w-0 truncate">
              <span className="text-muted">Next shift · </span>
              <strong>
                {new Date(nextShift.date).toLocaleDateString("en-AU", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {nextShift.shiftStart}–{nextShift.shiftEnd}
              </strong>
              {nextShift.service?.name && (
                <span className="text-muted"> · {nextShift.service.name}</span>
              )}
            </span>
          ) : (
            <span className="text-sm text-muted">
              No shifts rostered in the next 7 days
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-muted ml-auto flex-shrink-0" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/* ---- Glance tiles ---- */

interface GlanceLeaveBalance {
  leaveCategoryId: number;
  leaveCategoryName: string;
  accruedAmount: number;
  unitType: "Hours" | "Days" | "Weeks";
}

/** Standard 7.6-hour day — same constant as MyLeaveContent's ≈days hint. */
const HOURS_PER_DAY = 7.6;

function GlanceTile({
  href,
  icon: Icon,
  label,
  value,
  sub,
  subClass,
  testId,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  subClass?: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="bg-card rounded-xl border border-border p-4 flex flex-col gap-1 min-w-0 hover:border-brand/30 transition-colors"
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Icon className="w-3.5 h-3.5 text-brand" aria-hidden />
        {label}
      </span>
      <span className="text-2xl font-heading font-bold tracking-tight text-foreground truncate">
        {value}
      </span>
      <span className={cn("text-2xs", subClass ?? "text-muted")}>
        {sub ?? " "}
      </span>
    </Link>
  );
}

/**
 * Four glance tiles → the dedicated destinations. Pay reuses the shared
 * useMyPayslips hook; leave/expenses use the SAME queryKey + options as
 * MyLeaveContent / MyExpensesContent (there is no extracted hook for
 * those yet — the keys matching means one cache entry, no double fetch).
 * Every tile falls back to "—" when not linked / loading / errored.
 */
function GlanceTiles({
  certStats,
  requiredCertStats,
}: {
  certStats: { valid: number; expiring: number; expired: number; total: number } | null;
  /** Phase 9: per-TYPE counts over the cert types required for this user's
   *  role (org-settings matrix). When present it wins over the all-certs
   *  certStats — "N of M required". Null = no required types configured. */
  requiredCertStats: {
    valid: number;
    expiring: number;
    expired: number;
    missing: number;
    total: number;
  } | null;
}) {
  const payslipsQuery = useMyPayslips();

  const balancesQuery = useQuery<{ balances: GlanceLeaveBalance[] }, ApiResponseError>({
    queryKey: ["my-leave-balances-eh"],
    queryFn: () => fetchApi("/api/my-portal/leave/balances"),
    meta: { suppressGlobalErrorToast: true },
    staleTime: 5 * 60_000,
    retry: terminalRetry,
  });

  const expensesQuery = useQuery<{ requests: ExpenseRequest[] }, ApiResponseError>({
    queryKey: ["my-expenses"],
    queryFn: () => fetchApi("/api/my-portal/expenses"),
    meta: { suppressGlobalErrorToast: true },
    staleTime: 60_000,
    retry: terminalRetry,
  });

  // Pay — latest slip's net.
  const latestSlip = payslipsQuery.data?.payslips[0];
  const payValue = latestSlip ? formatCurrency(latestSlip.netEarnings) : "—";
  const paySub = latestSlip
    ? `net · ${latestSlip.totalHours.toFixed(1)} hrs`
    : undefined;

  // Leave — the annual-leave category (fall back to the first balance).
  const balances = balancesQuery.data?.balances ?? [];
  const annual =
    balances.find((b) => /annual/i.test(b.leaveCategoryName)) ?? balances[0];
  const leaveValue = annual
    ? annual.unitType === "Hours"
      ? `${annual.accruedAmount.toFixed(1)} hrs`
      : `${annual.accruedAmount.toFixed(1)} ${annual.unitType.toLowerCase()}`
    : "—";
  const leaveSub =
    annual && annual.unitType === "Hours"
      ? `≈ ${(annual.accruedAmount / HOURS_PER_DAY).toFixed(1)} days available`
      : annual
        ? annual.leaveCategoryName
        : undefined;

  // Expenses — pending (awaiting-approval) claims. Same pending
  // predicate as MyExpensesContent's statusKind: anything that isn't
  // approved/paid/processed, rejected/declined, or cancelled.
  const requests = expensesQuery.data?.requests ?? [];
  const pendingClaims = requests.filter((r) => {
    const s = r.status.toLowerCase();
    return !(
      s.startsWith("approv") ||
      s.startsWith("paid") ||
      s.startsWith("process") ||
      s.startsWith("reject") ||
      s.startsWith("declin") ||
      s.startsWith("cancel")
    );
  });
  const pendingSum = pendingClaims.reduce((sum, r) => sum + totalAmount(r), 0);
  const expensesValue = expensesQuery.data ? formatCurrency(pendingSum) : "—";
  const expensesSub = expensesQuery.data
    ? pendingClaims.length > 0
      ? `${pendingClaims.length} claim${pendingClaims.length === 1 ? "" : "s"} awaiting approval`
      : "No claims awaiting approval"
    : undefined;

  // Compliance — required-only type counts when the role has a configured
  // requirement set (Phase 9); otherwise the legacy all-certs count.
  const complianceValue = requiredCertStats
    ? `${requiredCertStats.valid} of ${requiredCertStats.total} required`
    : certStats
      ? `${certStats.valid} of ${certStats.total}`
      : "—";
  const complianceSub = requiredCertStats
    ? requiredCertStats.expired > 0
      ? `${requiredCertStats.expired} expired`
      : requiredCertStats.missing > 0
        ? `${requiredCertStats.missing} missing`
        : requiredCertStats.expiring > 0
          ? `${requiredCertStats.expiring} expiring soon`
          : "up to date"
    : certStats
      ? certStats.expired > 0
        ? `${certStats.expired} expired`
        : certStats.expiring > 0
          ? `${certStats.expiring} expiring soon`
          : "up to date"
      : undefined;
  const complianceAlert = requiredCertStats
    ? {
        red: requiredCertStats.expired > 0 || requiredCertStats.missing > 0,
        amber: requiredCertStats.expiring > 0,
      }
    : {
        red: !!certStats && certStats.expired > 0,
        amber: !!certStats && certStats.expiring > 0,
      };
  const complianceSubClass = complianceAlert.red
    ? "text-red-600 dark:text-red-400 font-semibold"
    : complianceAlert.amber
      ? "text-amber-600 dark:text-amber-400 font-semibold"
      : undefined;

  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      data-testid="glance-tiles"
    >
      <GlanceTile
        href="/my-pay"
        icon={Wallet}
        label="Last pay"
        value={payValue}
        sub={paySub}
        testId="glance-pay"
      />
      <GlanceTile
        href="/my-leave"
        icon={CalendarDays}
        label="Annual leave"
        value={leaveValue}
        sub={leaveSub}
        testId="glance-leave"
      />
      <GlanceTile
        href="/my-expenses"
        icon={Receipt}
        label="Reimbursements"
        value={expensesValue}
        sub={expensesSub}
        subClass={pendingClaims.length > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : undefined}
        testId="glance-expenses"
      />
      <GlanceTile
        href="/compliance"
        icon={ShieldCheck}
        label="Compliance"
        value={complianceValue}
        sub={complianceSub}
        subClass={complianceSubClass}
        testId="glance-compliance"
      />
    </div>
  );
}

/* ---- Needs your attention ---- */

interface AttentionItem {
  key: string;
  chip: string;
  chipClass: string;
  label: React.ReactNode;
  /** Exactly one of onClick / href; neither = informational row. */
  onClick?: () => void;
  href?: string;
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const inner = (
    <>
      <span
        className={cn(
          "text-2xs font-bold rounded-full px-2.5 py-0.5 flex-shrink-0",
          item.chipClass,
        )}
      >
        {item.chip}
      </span>
      <span className="text-sm text-foreground flex-1 min-w-0 text-left">
        {item.label}
      </span>
      {(item.onClick || item.href) && (
        <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" aria-hidden />
      )}
    </>
  );
  const rowClass =
    "flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3 w-full";
  if (item.href) {
    return (
      <Link href={item.href} className={cn(rowClass, "hover:bg-border/50 transition-colors")}>
        {inner}
      </Link>
    );
  }
  if (item.onClick) {
    return (
      <button
        type="button"
        onClick={item.onClick}
        className={cn(rowClass, "hover:bg-border/50 transition-colors")}
      >
        {inner}
      </button>
    );
  }
  return <div className={rowClass}>{inner}</div>;
}

function AttentionCard({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className="bg-card rounded-xl border border-border p-5"
      data-testid="needs-attention"
    >
      <h3 className="text-sm font-bold text-foreground mb-3">
        Needs your attention
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <AttentionRow key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pulse Survey Section                                                */
/* ------------------------------------------------------------------ */

const PULSE_QUESTIONS = [
  { key: "q1Happy", label: "I feel happy at work" },
  { key: "q2Supported", label: "I feel supported by my team" },
  { key: "q3Schedule", label: "I am satisfied with my schedule" },
  { key: "q4Recommend", label: "I would recommend this workplace" },
] as const;

function PulseSurveySection() {
  const queryClient = useQueryClient();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState("");

  const { data: surveys, isError } = useQuery<Array<{
    id: string;
    periodMonth: string;
    q1Happy: number | null;
    submittedAt: string | null;
  }>>({
    queryKey: ["pulse-surveys-pending"],
    queryFn: async () => {
      const res = await fetch("/api/staff-pulse?pending=true");
      if (!res.ok) throw new Error("Failed to fetch surveys");
      return res.json();
    },
    staleTime: 30_000,
    retry: 2,
  });

  const pendingSurveys = surveys?.filter((s) => !s.submittedAt) || [];

  const submitMutation = useMutation({
    mutationFn: (surveyId: string) =>
      mutateApi("/api/staff-pulse", {
        method: "POST",
        body: {
          surveyId,
          q1Happy: ratings.q1Happy,
          q2Supported: ratings.q2Supported,
          q3Schedule: ratings.q3Schedule,
          q4Recommend: ratings.q4Recommend,
          q5Feedback: feedback || undefined,
        },
      }),
    onSuccess: () => {
      setRatings({});
      setFeedback("");
      queryClient.invalidateQueries({ queryKey: ["pulse-surveys-pending"] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to submit survey. Please try again.",
      });
    },
  });
  const submitting = submitMutation.isPending;

  const handleSubmit = (surveyId: string) => {
    const allRated = PULSE_QUESTIONS.every((q) => ratings[q.key]);
    if (!allRated) return;
    submitMutation.mutate(surveyId);
  };

  // Low-stakes section — disappear quietly if the pending list won't load.
  if (isError) return null;
  if (pendingSurveys.length === 0) return null;

  const survey = pendingSurveys[0];
  const [year, month] = survey.periodMonth.split("-");
  const monthName = new Date(Number(year), Number(month) - 1).toLocaleString(
    "en-AU",
    { month: "long", year: "numeric" },
  );
  const allRated = PULSE_QUESTIONS.every((q) => ratings[q.key]);

  return (
    <div className="bg-card rounded-xl border border-blue-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Pulse Survey — {monthName}
        </h3>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          Takes 1 min
        </span>
      </div>

      <p className="text-sm text-muted mb-5">
        Rate each statement from 1 (strongly disagree) to 5 (strongly agree).
      </p>

      <div className="space-y-4">
        {PULSE_QUESTIONS.map((q) => (
          <div key={q.key}>
            <p className="text-sm font-medium text-foreground/80 mb-2">{q.label}</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRatings({ ...ratings, [q.key]: val })}
                  className={cn(
                    "w-10 h-10 rounded-lg text-sm font-semibold transition-all flex items-center justify-center",
                    ratings[q.key] === val
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-surface text-muted hover:bg-border",
                  )}
                >
                  {val}
                </button>
              ))}
              <span className="flex items-center ml-2">
                {ratings[q.key] && (
                  <Star
                    className={cn(
                      "w-4 h-4",
                      ratings[q.key]! >= 4
                        ? "text-emerald-500"
                        : ratings[q.key]! >= 3
                        ? "text-amber-500"
                        : "text-red-500",
                    )}
                  />
                )}
              </span>
            </div>
          </div>
        ))}

        <div>
          <p className="text-sm font-medium text-foreground/80 mb-2">
            Any additional feedback? <span className="text-muted font-normal">(optional)</span>
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Share any thoughts, suggestions, or concerns..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 resize-none"
          />
        </div>

        <button
          onClick={() => handleSubmit(survey.id)}
          disabled={!allRated || submitting}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {submitting ? "Submitting..." : "Submit Survey"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Page Component                                                 */
/* ------------------------------------------------------------------ */

export default function MyPortalPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useMyPortal();
  // Phase 9: cert-requirements matrix, via the client-safe config slice.
  const { data: orgConfig } = useOrgConfig();

  const [ackPolicyId, setAckPolicyId] = useState<string | null>(null);
  const [ackPolicyTitle, setAckPolicyTitle] = useState("");

  /* ---- Policy acknowledgement mutation ---- */
  const acknowledgePolicyMutation = useMutation({
    mutationFn: async (policyId: string) => {
      const res = await fetch(`/api/policies/${policyId}/acknowledge`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to acknowledge policy");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-portal"] });
      setAckPolicyId(null);
      setAckPolicyTitle("");
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  // Contract acknowledgement now happens inside ContractViewerModal — the
  // staff member reads the document and acknowledges from a sticky footer
  // button in one place, instead of a separate Acknowledge button on the
  // card. The modal owns its own mutation and invalidates ["my-portal"].

  /* ---- Derived data ---- */
  const pendingItemCounts = useMemo(() => {
    if (!data) return { policies: 0, leave: 0, contract: false, total: 0 };
    const policies = data.pendingPolicies.length;
    const leave = data.pendingLeaveRequests.length;
    const contract = data.activeContract ? !data.activeContract.acknowledgedByStaff : false;
    return { policies, leave, contract, total: policies + leave + (contract ? 1 : 0) };
  }, [data]);

  const certStats = useMemo(() => {
    if (!data || data.complianceCerts.length === 0) return null;
    let valid = 0;
    let expiring = 0;
    let expired = 0;

    data.complianceCerts.forEach((c) => {
      // No-expiry certs are always valid; don't run the days math on null.
      if (!c.expiryDate) {
        valid++;
        return;
      }
      const days = daysUntilExpiry(c.expiryDate);
      if (days < 0) expired++;
      else if (days <= 30) expiring++;
      else valid++;
    });

    return { valid, expiring, expired, total: data.complianceCerts.length };
  }, [data]);

  // Phase 9: required-only counts for the compliance glance tile. Counts
  // TYPES (not documents): for each cert type required for this user's
  // role, take the best cert on file — valid > expiring > expired — or
  // "missing" when there's none. Falls back to null (tile keeps the
  // all-certs certStats) when the role has no required types configured.
  const requiredCertStats = useMemo(() => {
    if (!data) return null;
    const requiredTypes = getRequiredCertTypes(data.profile.role, orgConfig, {
      isCentreAccount: session?.user?.isCentreAccount,
    });
    if (requiredTypes.length === 0) return null;

    let valid = 0;
    let expiring = 0;
    let expired = 0;
    let missing = 0;
    for (const type of requiredTypes) {
      const ofType = data.complianceCerts.filter((c) => c.type === type);
      if (ofType.length === 0) {
        missing++;
        continue;
      }
      const statuses = ofType.map((c) => {
        if (!c.expiryDate) return "valid";
        const days = daysUntilExpiry(c.expiryDate);
        return days < 0 ? "expired" : days <= 30 ? "expiring" : "valid";
      });
      if (statuses.includes("valid")) valid++;
      else if (statuses.includes("expiring")) expiring++;
      else expired++;
    }
    return { valid, expiring, expired, missing, total: requiredTypes.length };
  }, [data, orgConfig, session?.user?.isCentreAccount]);

  /* ---- Loading State ---- */
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <LoadingSkeleton />
      </div>
    );
  }

  /* ---- Error State ---- */
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Unable to load your portal
        </h3>
        <p className="text-sm text-muted max-w-sm">
          Something went wrong while loading your data. Please try refreshing the page.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  const { profile, activeContract, pendingPolicies, offboardingProgress, lmsEnrollments, complianceCerts } = data;
  const firstName = getFirstName(profile.name);

  /* ---- "Needs your attention" — consolidated from data this page
     already fetches: pending policy acks, unsigned contract, pending
     internal leave requests, and expiring/expired certs. (Swap requests
     aren't fetched on this page, so they're not represented here.) ---- */
  const attentionItems: AttentionItem[] = [
    ...pendingPolicies.map((policy) => ({
      key: `policy-${policy.id}`,
      chip: "Policy",
      chipClass:
        "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
      label: (
        <>
          Acknowledge <strong>{policy.title}</strong>
        </>
      ),
      onClick: () => {
        setAckPolicyId(policy.id);
        setAckPolicyTitle(policy.title);
      },
    })),
    ...(pendingItemCounts.contract
      ? [
          {
            key: "contract",
            chip: "Contract",
            chipClass: "bg-brand/10 text-brand",
            label: (
              <>
                Your contract needs a <strong>signature</strong>
              </>
            ),
            href: "/my-contract",
          },
        ]
      : []),
    ...(pendingItemCounts.leave > 0
      ? [
          {
            key: "leave-pending",
            chip: "Leave",
            chipClass: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
            label: (
              <>
                {pendingItemCounts.leave} leave{" "}
                {pendingItemCounts.leave === 1 ? "request" : "requests"} awaiting
                approval
              </>
            ),
          },
        ]
      : []),
    ...complianceCerts
      .filter((c) => c.expiryDate && daysUntilExpiry(c.expiryDate) <= 30)
      .map((cert) => {
        const days = daysUntilExpiry(cert.expiryDate!);
        return {
          key: `cert-${cert.id}`,
          chip: "Cert",
          chipClass:
            "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
          label:
            days < 0 ? (
              <>
                {certTypeLabels[cert.type] || cert.type} expired{" "}
                <strong>{Math.abs(days)} days ago</strong> — renew
              </>
            ) : (
              <>
                {certTypeLabels[cert.type] || cert.type} expires in{" "}
                <strong>{days} days</strong> — renew
              </>
            ),
          href: "/compliance",
        };
      }),
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ============================================================ */}
      {/* 1. WELCOME HEADER                                            */}
      {/* ============================================================ */}
      <PageHeader title={`Welcome back, ${firstName}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-brand/10 text-brand capitalize">
            <UserCircle className="w-3.5 h-3.5" />
            {profile.role}
          </span>
          {profile.service && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-surface text-muted">
              <Building2 className="w-3.5 h-3.5" />
              {profile.service.name}
            </span>
          )}
          {profile.startDate && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-surface text-muted">
              <Calendar className="w-3.5 h-3.5" />
              Started {formatDate(profile.startDate)}
            </span>
          )}
        </div>
      </PageHeader>

      {/* ============================================================ */}
      {/* 1b. AI MORNING BRIEF (2026-07-05) — hidden until the daily    */}
      {/* cron has composed today's brief for this user.                */}
      {/* ============================================================ */}
      <MorningBriefCard />

      {/* Push opt-in (Staff Portal v2 3.3c) — self-gating: staff-tier
          roles, push supported, permission "default", not subscribed,
          not dismissed. Renders null otherwise. */}
      <PushOptInCard />

      {/* 2026-10-07: the ONE onboarding list — replaces the onboarding,
          training, compliance, policy and contract cards that used to
          stack below. Educators and Directors of Service only; hides
          itself once everything is done. */}
      {(profile.role === "staff" || profile.role === "member") &&
        !session?.user?.isCentreAccount && (
          <GetReadyChecklist
            contract={activeContract}
            hasTraining={lmsEnrollments.length > 0}
          />
        )}

      {/* ============================================================ */}
      {/* 2. HOME HUB — next-shift hero, glance tiles, quick actions,  */}
      {/* consolidated "Needs your attention" (Staff Portal v2 1.6).   */}
      {/* Payslips / EH leave / expenses moved to /my-pay, /my-leave,  */}
      {/* /my-expenses — the tiles below link there.                   */}
      {/* ============================================================ */}
      {session?.user?.id && <NextShiftHero userId={session.user.id} />}

      <GlanceTiles certStats={certStats} requiredCertStats={requiredCertStats} />

      <AttentionCard items={attentionItems} />

      {/* ============================================================ */}
      {/* 3. PROFILE SUMMARY CARD                                      */}
      {/* ============================================================ */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex flex-col sm:flex-row gap-5">
          {/* Left: Avatar + core info */}
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="flex-shrink-0 w-14 h-14 rounded-full bg-brand flex items-center justify-center text-white text-lg font-bold">
              {getInitials(profile.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground truncate">
                {profile.name}
              </h2>
              <div className="space-y-1 mt-1">
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{profile.email}</span>
                </p>
                {profile.phone && (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    {profile.phone}
                  </p>
                )}
                <p className="flex items-center gap-2 text-sm text-muted capitalize">
                  <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                  {profile.role}
                  {profile.service && (
                    <span className="text-muted">
                      &middot; {profile.service.name}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Key details */}
          <div className="sm:border-l sm:border-border/50 sm:pl-5 flex-shrink-0 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted w-28">Employment</span>
              <span className="font-medium text-foreground/80">
                {formatEmploymentType(profile.employmentType)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted w-28">Start Date</span>
              <span className="font-medium text-foreground/80">
                {formatDate(profile.startDate)}
              </span>
            </div>
            {profile.visaStatus && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted w-28">Visa Status</span>
                <span className="font-medium text-foreground/80 capitalize">
                  {profile.visaStatus}
                </span>
                {profile.visaExpiry && (
                  <span className="text-xs text-muted">
                    (exp. {formatDate(profile.visaExpiry)})
                  </span>
                )}
              </div>
            )}
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-brand hover:underline"
            >
              Edit my details
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Performance reviews self-render only when one is waiting on the */}
      {/* staff member (self-assessment or acknowledgement).             */}
      {session?.user?.id && <MyPerformanceReviewsCard />}

      {/* ============================================================ */}
      {/* 8b. PULSE SURVEY                                             */}
      {/* ============================================================ */}
      <PulseSurveySection />

      {/* ============================================================ */}
      {/* 10. OFFBOARDING PROGRESS                                     */}
      {/* ============================================================ */}
      {offboardingProgress.active && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <CircleDot className="w-5 h-5 text-orange-500" />
              Offboarding Progress
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full",
                offboardingProgress.status === "in_progress"
                  ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                  : "bg-surface text-muted border border-border"
              )}
            >
              {offboardingProgress.status === "in_progress" ? "In Progress" : "Not Started"}
            </span>
          </div>

          <p className="text-sm text-muted mb-3">
            <span className="font-medium text-foreground">{offboardingProgress.packName}</span>
          </p>

          {offboardingProgress.totalTasks !== undefined && offboardingProgress.totalTasks > 0 && (
            <>
              <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                <span>
                  {offboardingProgress.completedTasks} / {offboardingProgress.totalTasks} tasks complete
                </span>
                <span className="font-semibold text-orange-600">
                  {Math.round(((offboardingProgress.completedTasks || 0) / offboardingProgress.totalTasks) * 100)}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round(((offboardingProgress.completedTasks || 0) / offboardingProgress.totalTasks) * 100)}%`,
                  }}
                />
              </div>
            </>
          )}

          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-brand hover:underline"
          >
            Go to Offboarding
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* ============================================================ */}
      {/* POLICY ACKNOWLEDGEMENT MODAL                                 */}
      {/* ============================================================ */}
      {ackPolicyId && (
        <PolicyAckModal
          policyTitle={ackPolicyTitle}
          isPending={acknowledgePolicyMutation.isPending}
          onConfirm={() => acknowledgePolicyMutation.mutate(ackPolicyId)}
          onCancel={() => {
            if (!acknowledgePolicyMutation.isPending) {
              setAckPolicyId(null);
              setAckPolicyTitle("");
            }
          }}
        />
      )}

    </div>
  );
}
