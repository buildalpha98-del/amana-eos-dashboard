"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  useExitSurveySummary,
  useTriggerExitSurvey,
  type ServiceSurveyData,
  type ReasonDistribution,
} from "@/hooks/useExitSurveys";
import { useServices } from "@/hooks/useServices";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { hasMinRole } from "@/lib/role-permissions";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  Star,
  TrendingDown,
  Users,
  BarChart3,
  Send,
  X,
  Loader2,
  MessageSquare,
  ArrowRight,
  Copy,
} from "lucide-react";
import type { Role } from "@prisma/client";

// ── Reason Colors ──────────────────────────────────────────────

const REASON_COLORS: Record<string, string> = {
  relocation: "#6366f1",
  cost: "#f59e0b",
  quality: "#ef4444",
  schedule: "#10b981",
  child_aged_out: "#8b5cf6",
  other_provider: "#ec4899",
  no_longer_needed: "#64748b",
  other: "#94a3b8",
};

function getReasonColor(reason: string): string {
  return REASON_COLORS[reason.toLowerCase().replace(/\s+/g, "_")] || REASON_COLORS.other;
}

function formatReason(reason: string): string {
  return reason
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Stars Component ────────────────────────────────────────────

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "w-4 h-4",
            i < Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "fill-gray-200 text-gray-200"
          )}
        />
      ))}
      <span className="ml-1.5 text-sm font-medium text-foreground">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

// ── Stacked Bar ────────────────────────────────────────────────

function ReasonBar({ reasons }: { reasons: ReasonDistribution[] }) {
  if (!reasons.length) {
    return <p className="text-sm text-gray-400">No reason data</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        {reasons.map((r) => (
          <div
            key={r.reason}
            className="h-full transition-all"
            style={{
              width: `${r.percentage}%`,
              backgroundColor: getReasonColor(r.reason),
              minWidth: r.percentage > 0 ? "4px" : "0px",
            }}
            title={`${formatReason(r.reason)}: ${r.count} (${r.percentage}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {reasons.map((r) => (
          <div key={r.reason} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getReasonColor(r.reason) }}
            />
            {formatReason(r.reason)} ({r.count})
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Service Card ───────────────────────────────────────────────

function ServiceCard({ service }: { service: ServiceSurveyData }) {
  const wouldReturnColor =
    service.wouldReturnRate > 70
      ? "text-emerald-600 bg-emerald-50"
      : service.wouldReturnRate >= 40
        ? "text-amber-600 bg-amber-50"
        : "text-red-600 bg-red-50";

  return (
    <div className="bg-background rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-foreground">{service.serviceName}</h4>
          <p className="text-xs text-gray-500">{service.serviceCode}</p>
        </div>
        <span className="text-sm font-medium text-gray-500">
          {service.totalExits} exit{service.totalExits !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Satisfaction</p>
          <StarRating rating={service.averageSatisfaction} />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Would Return</p>
          <span className={cn("inline-block text-sm font-semibold px-2 py-0.5 rounded-full", wouldReturnColor)}>
            {service.wouldReturnRate.toFixed(0)}%
          </span>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Reasons for Leaving</p>
        <ReasonBar reasons={service.reasonDistribution} />
      </div>

      {service.recentComments.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            Recent Comments
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {service.recentComments.slice(0, 5).map((c, i) => (
              <div key={i} className="bg-surface rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium text-gray-400">
                    {new Date(c.date).toLocaleDateString()}
                  </span>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: getReasonColor(c.reason) }}
                  >
                    {formatReason(c.reason)}
                  </span>
                </div>
                <p className="text-sm text-foreground">{c.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Trigger Modal ──────────────────────────────────────────────

function TriggerSurveyModal({
  onClose,
  services,
}: {
  onClose: () => void;
  services: { id: string; name: string; code: string }[];
}) {
  const trigger = useTriggerExitSurvey();
  const [serviceId, setServiceId] = useState("");
  const [childName, setChildName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [withdrawalDate, setWithdrawalDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceId || !childName) return;

    trigger.mutate(
      {
        serviceId,
        childName,
        contactEmail: contactEmail || undefined,
        withdrawalDate: withdrawalDate || undefined,
      },
      {
        onSuccess: (data) => {
          toast({ description: "Exit survey sent successfully." });
          // Copy survey URL to clipboard
          if (data.surveyUrl) {
            navigator.clipboard.writeText(data.surveyUrl).then(() => {
              toast({ description: "Survey URL copied to clipboard." });
            }).catch(() => {
              // Ignore clipboard errors
            });
          }
          onClose();
        },
        onError: (err) => {
          toast({ description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-foreground">Send Exit Survey</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Service <span className="text-red-500">*</span>
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">Select service...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Child Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              required
              placeholder="Enter child's name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="parent@example.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Withdrawal Date
            </label>
            <input
              type="date"
              value={withdrawalDate}
              onChange={(e) => setWithdrawalDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={trigger.isPending || !serviceId || !childName}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {trigger.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send Survey
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────

function ExitSurveySkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-background rounded-xl border border-border p-4 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      {/* Service cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-background rounded-xl border border-border p-5 space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export function ExitSurveyDashboard() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const canTrigger = hasMinRole(role, "admin");

  const [filterServiceId, setFilterServiceId] = useState<string>("");
  const [filterMonths, setFilterMonths] = useState<number>(6);
  const [showTriggerModal, setShowTriggerModal] = useState(false);

  const { data: services = [] } = useServices();
  const { data: summary, isLoading } = useExitSurveySummary({
    serviceId: filterServiceId || undefined,
    months: filterMonths,
  });

  // Aggregated stats
  const totalExits = summary?.services.reduce((sum, s) => sum + s.totalExits, 0) ?? 0;
  const avgSatisfaction =
    summary && summary.services.length > 0
      ? summary.services.reduce((sum, s) => sum + s.averageSatisfaction * s.totalExits, 0) /
        Math.max(totalExits, 1)
      : 0;
  const avgWouldReturn =
    summary && summary.services.length > 0
      ? summary.services.reduce((sum, s) => sum + s.wouldReturnRate * s.totalExits, 0) /
        Math.max(totalExits, 1)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-violet-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Exit Surveys</h3>
            <p className="text-sm text-gray-500">Track why families leave and satisfaction trends</p>
          </div>
        </div>

        {canTrigger && (
          <button
            onClick={() => setShowTriggerModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Send className="w-4 h-4" />
            Send Survey
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterServiceId}
          onChange={(e) => setFilterServiceId(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">All Services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={filterMonths}
          onChange={(e) => setFilterMonths(Number(e.target.value))}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      </div>

      {/* Loading */}
      {isLoading && <ExitSurveySkeleton />}

      {/* Content */}
      {!isLoading && summary && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-background rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-xs font-medium">Total Exits</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totalExits}</p>
            </div>

            <div className="bg-background rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Star className="w-4 h-4" />
                <span className="text-xs font-medium">Avg Satisfaction</span>
              </div>
              <StarRating rating={avgSatisfaction} />
            </div>

            <div className="bg-background rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <ArrowRight className="w-4 h-4" />
                <span className="text-xs font-medium">Would Return</span>
              </div>
              <p
                className={cn(
                  "text-2xl font-bold",
                  avgWouldReturn > 70
                    ? "text-emerald-600"
                    : avgWouldReturn >= 40
                      ? "text-amber-600"
                      : "text-red-600"
                )}
              >
                {avgWouldReturn.toFixed(0)}%
              </p>
            </div>

            <div className="bg-background rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs font-medium">Churn Rate</span>
              </div>
              <p
                className={cn(
                  "text-2xl font-bold",
                  summary.churn.churnRate < 5
                    ? "text-emerald-600"
                    : summary.churn.churnRate < 15
                      ? "text-amber-600"
                      : "text-red-600"
                )}
              >
                {summary.churn.churnRate.toFixed(1)}%
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {summary.churn.withdrawnCount} withdrawn / {summary.churn.activeCount} active
              </p>
            </div>
          </div>

          {/* Service Cards */}
          {summary.services.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {summary.services.map((service) => (
                <ServiceCard key={service.serviceId} service={service} />
              ))}
            </div>
          ) : (
            <div className="bg-background rounded-xl border border-border p-8 text-center">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-lg">No exit survey data yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Send an exit survey to start collecting feedback from departing families.
              </p>
            </div>
          )}
        </>
      )}

      {/* Trigger Modal */}
      {showTriggerModal && (
        <TriggerSurveyModal
          onClose={() => setShowTriggerModal(false)}
          services={services.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
        />
      )}
    </div>
  );
}
