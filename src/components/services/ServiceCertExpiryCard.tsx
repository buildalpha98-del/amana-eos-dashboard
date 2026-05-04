"use client";

/**
 * ServiceCertExpiryCard — at-a-glance cert health for the per-service
 * Compliance group. Renders a coloured banner when there's at least
 * one expired/critical cert, otherwise stays quiet (the cron + bell
 * already covered the proactive nudge — this is the "land on the
 * Compliance tab and immediately see what's broken" surface).
 *
 * Severity colour map (matches the timeclock variance pattern):
 *   - any expired      → red banner ("X expired")
 *   - any critical/≤7d → red banner ("X expiring within a week")
 *   - any warning/≤14d → amber banner
 *   - upcoming-only    → yellow banner (informational)
 *   - none             → render nothing
 *
 * 2026-05-04: introduced as the dashboard surface called out in
 * next-priorities.md Tier 1 ("compliance risk widget per service").
 */

import { ShieldAlert, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import {
  useServiceCertExpirySummary,
  type AffectedStaffMember,
  type AffectedCert,
} from "@/hooks/useServiceCertExpirySummary";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const CERT_TYPE_LABELS: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  cpr: "CPR",
  police_check: "Police Check",
  annual_review: "Annual Review",
  child_protection: "Child Protection",
  geccko: "GECCKO",
  food_safety: "Food Safety",
  food_handler: "Food Handler",
  other: "Other",
};

interface ServiceCertExpiryCardProps {
  serviceId: string;
}

export function ServiceCertExpiryCard({ serviceId }: ServiceCertExpiryCardProps) {
  const { data, isLoading, error } = useServiceCertExpirySummary(serviceId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return <Skeleton className="h-16 w-full mb-4" />;
  }
  // Errored or no data — stay quiet rather than show a broken banner.
  if (error || !data) return null;

  const { totals, affectedStaff } = data;
  const totalProblems =
    totals.expired + totals.critical + totals.warning + totals.upcoming;

  // No issues → render nothing. The Compliance group still has its
  // own surfaces; we don't take up space announcing "all good".
  if (totalProblems === 0) return null;

  // Pick the banner colour from the worst-severity bucket.
  const tone =
    totals.expired > 0 || totals.critical > 0
      ? "red"
      : totals.warning > 0
        ? "amber"
        : "yellow";

  const toneStyles = {
    red: "border-red-300 bg-red-50",
    amber: "border-amber-300 bg-amber-50",
    yellow: "border-yellow-200 bg-yellow-50",
  }[tone];

  const iconColor = {
    red: "text-red-700",
    amber: "text-amber-700",
    yellow: "text-yellow-700",
  }[tone];

  return (
    <section
      className={cn(
        "rounded-xl border p-4 mb-4 space-y-3",
        toneStyles,
      )}
      data-testid="service-cert-expiry-card"
    >
      <header className="flex items-start gap-3">
        {totals.expired > 0 || totals.critical > 0 ? (
          <ShieldAlert className={cn("w-5 h-5 mt-0.5", iconColor)} />
        ) : (
          <ShieldCheck className={cn("w-5 h-5 mt-0.5", iconColor)} />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {summaryHeadline(totals)}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {summarySubhead(totals)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-foreground/80 hover:text-foreground inline-flex items-center gap-1"
          aria-expanded={expanded}
        >
          {expanded ? "Hide details" : "Show details"}
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </header>

      {expanded && affectedStaff.length > 0 && (
        <ul className="space-y-2 pt-2 border-t border-current/10">
          {affectedStaff.map((s) => (
            <AffectedStaffRow key={s.userId} staff={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Headline / sub-headline copy ──────────────────────────────────────

function summaryHeadline(totals: {
  expired: number;
  critical: number;
  warning: number;
  upcoming: number;
}): string {
  if (totals.expired > 0) {
    return totals.expired === 1
      ? "1 expired certificate at this service"
      : `${totals.expired} expired certificates at this service`;
  }
  if (totals.critical > 0) {
    return totals.critical === 1
      ? "1 certificate expiring within a week"
      : `${totals.critical} certificates expiring within a week`;
  }
  if (totals.warning > 0) {
    return totals.warning === 1
      ? "1 certificate expiring within 2 weeks"
      : `${totals.warning} certificates expiring within 2 weeks`;
  }
  return totals.upcoming === 1
    ? "1 certificate expiring within a month"
    : `${totals.upcoming} certificates expiring within a month`;
}

function summarySubhead(totals: {
  expired: number;
  critical: number;
  warning: number;
  upcoming: number;
}): string {
  const parts: string[] = [];
  if (totals.expired > 0) parts.push(`${totals.expired} expired`);
  if (totals.critical > 0) parts.push(`${totals.critical} ≤ 7 days`);
  if (totals.warning > 0) parts.push(`${totals.warning} ≤ 14 days`);
  if (totals.upcoming > 0) parts.push(`${totals.upcoming} ≤ 30 days`);
  return parts.join(" · ");
}

// ── Affected-staff row ────────────────────────────────────────────────

function AffectedStaffRow({ staff }: { staff: AffectedStaffMember }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/40 bg-card p-3">
      <StaffAvatar
        user={{ id: staff.userId, name: staff.name, avatar: staff.avatar }}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {staff.name}
        </p>
        <ul className="mt-1 space-y-0.5">
          {staff.certs.map((c, i) => (
            <li
              key={`${c.type}-${i}`}
              className="text-xs flex items-center gap-2"
            >
              <CertStatusPill cert={c} />
              <span className="text-muted">
                {CERT_TYPE_LABELS[c.type] ?? c.type}
                {" · "}
                {expiryWording(c)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function CertStatusPill({ cert }: { cert: AffectedCert }) {
  const tone =
    cert.status === "expired"
      ? "bg-red-100 text-red-800 border-red-300"
      : cert.status === "critical"
        ? "bg-red-50 text-red-700 border-red-200"
        : cert.status === "warning"
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : "bg-yellow-50 text-yellow-800 border-yellow-200";
  const label =
    cert.status === "expired"
      ? "Expired"
      : cert.status === "critical"
        ? "≤ 7 days"
        : cert.status === "warning"
          ? "≤ 14 days"
          : "≤ 30 days";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function expiryWording(cert: AffectedCert): string {
  if (cert.status === "expired") {
    const days = Math.abs(cert.daysUntilExpiry);
    return days === 0
      ? "expired today"
      : days === 1
        ? "expired 1 day ago"
        : `expired ${days} days ago`;
  }
  return cert.daysUntilExpiry === 0
    ? "expires today"
    : cert.daysUntilExpiry === 1
      ? "expires in 1 day"
      : `expires in ${cert.daysUntilExpiry} days`;
}
