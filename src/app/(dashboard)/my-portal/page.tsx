"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMyPortal } from "@/hooks/useMyPortal";
import {
  User,
  Mail,
  Phone,
  Building2,
  Calendar,
  Briefcase,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  BookOpen,
  GraduationCap,
  FileText,
  ShieldCheck,
  UserCircle,
  Plane,
  X,
  ClipboardCheck,
  CircleDot,
  Award,
  DollarSign,
  CalendarDays,
  Loader2,
  ExternalLink,
  MessageSquare,
  Star,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { SessionManagement } from "@/components/settings/SessionManagement";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/hooks/useToast";

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

const leaveTypeConfig: Record<string, { color: string; bgColor: string; borderColor: string }> = {
  annual: { color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  sick: { color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  personal: { color: "text-purple-700", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
  long_service: { color: "text-teal-700", bgColor: "bg-teal-50", borderColor: "border-teal-200" },
  unpaid: { color: "text-foreground/80", bgColor: "bg-surface/50", borderColor: "border-border" },
};

function getLeaveConfig(type: string) {
  return leaveTypeConfig[type] || { color: "text-foreground/80", bgColor: "bg-surface/50", borderColor: "border-border" };
}

function formatLeaveType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

function formatContractType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h3 className="text-lg font-semibold text-foreground">
            Acknowledge Policy
          </h3>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
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
            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-brand" id="policy-ack-checkbox" />
            <span className="text-sm text-foreground/80 select-none">
              I have read and understood this policy
            </span>
          </label>
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
              const cb = document.getElementById("policy-ack-checkbox") as HTMLInputElement | null;
              if (!cb?.checked) {
                cb?.focus();
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
  const [submitting, setSubmitting] = useState(false);

  const { data: surveys } = useQuery<Array<{
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
  });

  const pendingSurveys = surveys?.filter((s) => !s.submittedAt) || [];

  const handleSubmit = async (surveyId: string) => {
    const allRated = PULSE_QUESTIONS.every((q) => ratings[q.key]);
    if (!allRated) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/staff-pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyId,
          q1Happy: ratings.q1Happy,
          q2Supported: ratings.q2Supported,
          q3Schedule: ratings.q3Schedule,
          q4Recommend: ratings.q4Recommend,
          q5Feedback: feedback || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      setRatings({});
      setFeedback("");
      queryClient.invalidateQueries({ queryKey: ["pulse-surveys-pending"] });
    } catch {
      alert("Failed to submit survey. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
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
  const { data, isLoading, error } = useMyPortal();

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

  /* ---- Contract acknowledgement mutation ---- */
  const ackContractMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await fetch(`/api/contracts/${contractId}/acknowledge`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to acknowledge contract");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-portal"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

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
      const days = daysUntilExpiry(c.expiryDate);
      if (days < 0) expired++;
      else if (days <= 30) expiring++;
      else valid++;
    });

    return { valid, expiring, expired, total: data.complianceCerts.length };
  }, [data]);

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
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Unable to load your portal
        </h3>
        <p className="text-sm text-muted max-w-sm">
          Something went wrong while loading your data. Please try refreshing the page.
        </p>
      </div>
    );
  }

  const { profile, leaveBalances, activeContract, pendingPolicies, onboardingProgress, offboardingProgress, lmsEnrollments, complianceCerts } = data;
  const firstName = getFirstName(profile.name);

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
      {/* 2. QUICK ACTIONS BANNER                                      */}
      {/* ============================================================ */}
      {pendingItemCounts.total > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-amber-800">
              {pendingItemCounts.policies > 0 && (
                <button
                  onClick={() => document.getElementById("section-policies")?.scrollIntoView({ behavior: "smooth" })}
                  className="font-medium hover:underline"
                >
                  {pendingItemCounts.policies} pending {pendingItemCounts.policies === 1 ? "policy" : "policies"} to acknowledge
                </button>
              )}
              {pendingItemCounts.leave > 0 && (
                <span className="font-medium">
                  {pendingItemCounts.leave} pending leave {pendingItemCounts.leave === 1 ? "request" : "requests"}
                </span>
              )}
              {pendingItemCounts.contract && (
                <button
                  onClick={() => document.getElementById("section-contract")?.scrollIntoView({ behavior: "smooth" })}
                  className="font-medium hover:underline"
                >
                  Contract requires acknowledgement
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
              Edit Profile
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. LEAVE BALANCES                                            */}
      {/* ============================================================ */}
      {leaveBalances.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Plane className="w-5 h-5 text-brand" />
              Leave Balances
            </h3>
            <Link
              href="/leave"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              Request Leave
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {leaveBalances.map((lb) => {
              const config = getLeaveConfig(lb.leaveType);
              return (
                <div
                  key={lb.leaveType}
                  className={cn(
                    "bg-card rounded-xl border p-4",
                    config.borderColor
                  )}
                >
                  <p className={cn("text-xs font-semibold uppercase tracking-wider mb-1", config.color)}>
                    {formatLeaveType(lb.leaveType)}
                  </p>
                  <p className={cn("text-3xl font-bold", config.color)}>
                    {lb.balance}
                    <span className="text-sm font-normal ml-1 text-muted">days</span>
                  </p>
                  <p className="text-xs text-muted mt-1">
                    accrued: {lb.accrued} &middot; taken: {lb.taken}
                    {lb.pending > 0 && (
                      <span className="text-amber-500"> &middot; pending: {lb.pending}</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. ACTIVE CONTRACT                                           */}
      {/* ============================================================ */}
      {activeContract && (
        <div id="section-contract" className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand" />
              Active Contract
            </h3>
            {activeContract.acknowledgedByStaff ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Acknowledged
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" />
                Action Required
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted mb-0.5">Contract Type</p>
              <p className="text-sm font-semibold text-foreground">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold rounded-full bg-brand/10 text-brand">
                  {formatContractType(activeContract.contractType)}
                </span>
              </p>
            </div>
            {activeContract.awardLevel && (
              <div>
                <p className="text-xs text-muted mb-0.5">Award Level</p>
                <p className="text-sm font-medium text-foreground/80">{activeContract.awardLevel}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted mb-0.5">Pay Rate</p>
              <p className="text-sm font-medium text-foreground/80 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-muted" />
                {activeContract.payRate.toFixed(2)}/hr
              </p>
            </div>
            {activeContract.hoursPerWeek !== null && (
              <div>
                <p className="text-xs text-muted mb-0.5">Hours/Week</p>
                <p className="text-sm font-medium text-foreground/80 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-muted" />
                  {activeContract.hoursPerWeek}h
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted mb-4">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Start: {formatDate(activeContract.startDate)}
            </span>
            {activeContract.endDate && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                End: {formatDate(activeContract.endDate)}
              </span>
            )}
          </div>

          {!activeContract.acknowledgedByStaff && (
            <button
              onClick={() => ackContractMutation.mutate(activeContract.id)}
              disabled={ackContractMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {ackContractMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ClipboardCheck className="w-4 h-4" />
              )}
              {ackContractMutation.isPending ? "Acknowledging..." : "Acknowledge Contract"}
            </button>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. ONBOARDING PROGRESS                                       */}
      {/* ============================================================ */}
      {onboardingProgress.active && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-brand" />
              Onboarding Progress
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full",
                onboardingProgress.status === "in_progress"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-surface text-muted border border-border"
              )}
            >
              {onboardingProgress.status === "in_progress" ? "In Progress" : "Not Started"}
            </span>
          </div>

          <p className="text-sm text-muted mb-3">
            <span className="font-medium text-foreground">{onboardingProgress.packName}</span>
          </p>

          {/* Progress bar */}
          {onboardingProgress.totalTasks !== undefined && onboardingProgress.totalTasks > 0 && (
            <>
              <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                <span>
                  {onboardingProgress.completedTasks} / {onboardingProgress.totalTasks} tasks complete
                </span>
                <span className="font-semibold text-brand">
                  {Math.round(((onboardingProgress.completedTasks || 0) / onboardingProgress.totalTasks) * 100)}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round(((onboardingProgress.completedTasks || 0) / onboardingProgress.totalTasks) * 100)}%`,
                  }}
                />
              </div>
            </>
          )}

          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-brand hover:underline"
          >
            Go to Onboarding
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. TRAINING / LMS                                            */}
      {/* ============================================================ */}
      {lmsEnrollments.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand" />
              Training &amp; Courses
            </h3>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              View All
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {lmsEnrollments.map((enrollment) => {
              const statusConfig =
                enrollment.status === "completed"
                  ? { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Completed" }
                  : enrollment.status === "in_progress"
                  ? { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", label: "In Progress" }
                  : enrollment.status === "expired"
                  ? { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "Expired" }
                  : { bg: "bg-surface", text: "text-muted", border: "border-border", label: "Not Started" };

              return (
                <Link
                  href="/onboarding"
                  key={enrollment.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-brand/30 hover:bg-brand/5 transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {enrollment.courseName}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {enrollment.completedModules} / {enrollment.totalModules} modules
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-24 h-2 bg-surface rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          enrollment.status === "completed" ? "bg-emerald-500" : "bg-brand"
                        )}
                        style={{ width: `${enrollment.progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted w-8 text-right">
                      {enrollment.progress}%
                    </span>
                  </div>

                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border flex-shrink-0",
                      statusConfig.bg,
                      statusConfig.text,
                      statusConfig.border
                    )}
                  >
                    {statusConfig.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 8. COMPLIANCE CERTIFICATES                                   */}
      {/* ============================================================ */}
      {complianceCerts.length > 0 && certStats && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand" />
              Compliance Certificates
            </h3>
            <div className="flex items-center gap-2 text-xs">
              {certStats.valid > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                  {certStats.valid} valid
                </span>
              )}
              {certStats.expiring > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                  {certStats.expiring} expiring
                </span>
              )}
              {certStats.expired > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">
                  {certStats.expired} expired
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {complianceCerts.map((cert) => {
              const days = daysUntilExpiry(cert.expiryDate);
              const isExpired = days < 0;
              const isExpiring = days >= 0 && days <= 30;

              return (
                <div
                  key={cert.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border",
                    isExpired
                      ? "border-red-200 bg-red-50/50"
                      : isExpiring
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-border/50"
                  )}
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      isExpired ? "bg-red-500" : isExpiring ? "bg-amber-500" : "bg-emerald-500"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {certTypeLabels[cert.type] || cert.type}
                      {cert.label && (
                        <span className="text-muted font-normal ml-1.5">
                          &middot; {cert.label}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted">
                      {isExpired ? "Expired" : "Expires"} {formatDate(cert.expiryDate)}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded-lg border",
                        isExpired
                          ? "bg-red-50 text-red-600 border-red-200"
                          : isExpiring
                          ? "bg-amber-50 text-amber-600 border-amber-200"
                          : "bg-emerald-50 text-emerald-600 border-emerald-200"
                      )}
                    >
                      {isExpired
                        ? `${Math.abs(days)}d overdue`
                        : `${days}d left`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <Link
            href="/compliance"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-brand hover:underline"
          >
            Manage Certificates
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* ============================================================ */}
      {/* 8b. PULSE SURVEY                                             */}
      {/* ============================================================ */}
      <PulseSurveySection />

      {/* ============================================================ */}
      {/* 9. PENDING POLICIES                                          */}
      {/* ============================================================ */}
      {pendingPolicies.length > 0 && (
        <div id="section-policies" className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              Pending Policies
            </h3>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {pendingPolicies.length} to acknowledge
            </span>
          </div>

          <div className="space-y-2">
            {pendingPolicies.map((policy) => (
              <div
                key={policy.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-amber-100 bg-amber-50/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {policy.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {policy.category && (
                      <span className="text-xs text-muted capitalize">{policy.category}</span>
                    )}
                    <span className="text-xs text-muted">
                      v{policy.version}
                    </span>
                    {policy.publishedAt && (
                      <span className="text-xs text-muted">
                        &middot; Published {formatDate(policy.publishedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAckPolicyId(policy.id);
                    setAckPolicyTitle(policy.title);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-brand border border-brand/20 rounded-lg hover:bg-brand/5 transition-colors flex-shrink-0"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
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
      {/* NOTIFICATION PREFERENCES                                     */}
      {/* ============================================================ */}
      <NotificationPreferences />

      {/* ============================================================ */}
      {/* SECURITY & SESSION MANAGEMENT                                */}
      {/* ============================================================ */}
      <SessionManagement />

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
