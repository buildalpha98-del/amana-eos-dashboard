"use client";

/**
 * LeadershipCertExpiryCard — org-wide cert health rollup for the
 * leadership dashboard. Lists every service that has at least one
 * expired/expiring cert, sorted worst-first, so the State Manager
 * can spot which centres need a phone call this week.
 *
 * Quiet by default: hides itself when zero centres have any
 * compliance issues. Each row links straight to the centre's
 * Compliance tab where the per-service detail card (PR #69) shows
 * the affected staff.
 *
 * 2026-05-04: introduced as the org-wide complement to the
 * per-service `ServiceCertExpiryCard`. State Manager wanted "which
 * of my 11 centres has the worst compliance risk right now?" without
 * clicking into each one.
 */

import Link from "next/link";
import { ShieldAlert, ChevronRight } from "lucide-react";
import {
  useCertExpiryRollup,
  type ServiceRollupRowResponse,
} from "@/hooks/useCertExpiryRollup";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { CertStatus } from "@/lib/cert-expiry-summary";

const STATUS_TONE: Record<CertStatus, string> = {
  expired: "bg-red-100 text-red-800 border-red-300",
  critical: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  upcoming: "bg-yellow-50 text-yellow-800 border-yellow-200",
  valid: "bg-gray-50 text-gray-600 border-gray-200",
};

const STATUS_LABEL: Record<CertStatus, string> = {
  expired: "EXPIRED",
  critical: "CRITICAL",
  warning: "WARNING",
  upcoming: "UPCOMING",
  valid: "VALID",
};

export function LeadershipCertExpiryCard() {
  const { data, isLoading, error } = useCertExpiryRollup();

  if (isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </section>
    );
  }
  if (error || !data) return null;
  if (data.services.length === 0) return null;

  const totalProblems =
    data.orgTotals.expired +
    data.orgTotals.critical +
    data.orgTotals.warning +
    data.orgTotals.upcoming;

  return (
    <section
      className="rounded-xl border border-border bg-card p-6"
      data-testid="leadership-cert-expiry-card"
    >
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert
            className={cn(
              "h-5 w-5",
              data.orgTotals.expired > 0 || data.orgTotals.critical > 0
                ? "text-red-600"
                : "text-amber-600",
            )}
          />
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Compliance Risk
            </h3>
            <p className="text-xs text-muted">
              {totalProblems} certificate{totalProblems === 1 ? "" : "s"} across{" "}
              {data.services.length} service{data.services.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <OrgTotals totals={data.orgTotals} />
      </header>

      <ul className="space-y-2">
        {data.services.map((s) => (
          <ServiceRow key={s.serviceId} service={s} />
        ))}
      </ul>
    </section>
  );
}

// ── Org-totals chip cluster ───────────────────────────────────────

function OrgTotals({
  totals,
}: {
  totals: { expired: number; critical: number; warning: number; upcoming: number };
}) {
  const parts: Array<{ label: string; count: number; tone: string }> = [];
  if (totals.expired > 0)
    parts.push({
      label: "Expired",
      count: totals.expired,
      tone: "bg-red-100 text-red-800 border-red-300",
    });
  if (totals.critical > 0)
    parts.push({
      label: "≤ 7d",
      count: totals.critical,
      tone: "bg-red-50 text-red-700 border-red-200",
    });
  if (totals.warning > 0)
    parts.push({
      label: "≤ 14d",
      count: totals.warning,
      tone: "bg-amber-50 text-amber-800 border-amber-200",
    });
  if (totals.upcoming > 0)
    parts.push({
      label: "≤ 30d",
      count: totals.upcoming,
      tone: "bg-yellow-50 text-yellow-800 border-yellow-200",
    });
  return (
    <div className="flex flex-wrap items-center gap-1.5 justify-end">
      {parts.map((p) => (
        <span
          key={p.label}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
            p.tone,
          )}
        >
          <span className="font-bold">{p.count}</span>
          {p.label}
        </span>
      ))}
    </div>
  );
}

// ── Service row ───────────────────────────────────────────────────

function ServiceRow({ service }: { service: ServiceRollupRowResponse }) {
  const total =
    service.totals.expired +
    service.totals.critical +
    service.totals.warning +
    service.totals.upcoming;
  return (
    <Link
      href={`/services/${service.serviceId}?tab=compliance`}
      className="block rounded-lg border border-border bg-background hover:bg-surface/30 transition-colors p-3 group"
      data-testid={`cert-rollup-service-${service.serviceId}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-bold uppercase tracking-wide flex-shrink-0",
            STATUS_TONE[service.status],
          )}
        >
          {STATUS_LABEL[service.status]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {service.name}
            {service.code ? (
              <span className="text-muted font-normal"> · {service.code}</span>
            ) : null}
            {service.state ? (
              <span className="text-muted font-normal"> · {service.state}</span>
            ) : null}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {total} cert{total === 1 ? "" : "s"} ·{" "}
            {service.affectedStaffCount} staff affected
          </p>
        </div>
        <CompactCounts totals={service.totals} />
        <ChevronRight className="h-4 w-4 text-muted/40 group-hover:text-muted flex-shrink-0" />
      </div>
    </Link>
  );
}

function CompactCounts({
  totals,
}: {
  totals: { expired: number; critical: number; warning: number; upcoming: number };
}) {
  return (
    <div className="hidden sm:flex items-center gap-1 text-[10px] font-medium flex-shrink-0">
      {totals.expired > 0 ? (
        <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5">
          {totals.expired}E
        </span>
      ) : null}
      {totals.critical > 0 ? (
        <span className="rounded bg-red-50 text-red-700 px-1.5 py-0.5">
          {totals.critical}C
        </span>
      ) : null}
      {totals.warning > 0 ? (
        <span className="rounded bg-amber-50 text-amber-800 px-1.5 py-0.5">
          {totals.warning}W
        </span>
      ) : null}
      {totals.upcoming > 0 ? (
        <span className="rounded bg-yellow-50 text-yellow-800 px-1.5 py-0.5">
          {totals.upcoming}U
        </span>
      ) : null}
    </div>
  );
}
