/**
 * Pure helper: bucket compliance certificates by their distance to
 * expiry. Used by the per-service Cert Health card and the
 * `/api/services/[id]/cert-expiry-summary` endpoint that powers it.
 *
 * Thresholds match the existing daily compliance-alerts cron
 * (30/14/7) so the bell, the email digest, and the on-screen card all
 * agree about which certs are "in trouble":
 *  - **expired**  — expiryDate < asOf
 *  - **critical** — expires within 7 days (and not yet expired)
 *  - **warning**  — expires within 14 days (and not critical/expired)
 *  - **upcoming** — expires within 30 days (and not warning/critical/expired)
 *
 * 2026-05-04: introduced as the "compliance risk widget per service"
 * piece called out in next-priorities.md Tier 1.
 */

import type { CertificateType } from "@prisma/client";

export type CertStatus = "expired" | "critical" | "warning" | "upcoming" | "valid";

export interface CertInput {
  userId: string | null;
  type: CertificateType;
  expiryDate: Date;
}

export interface AffectedCert {
  type: CertificateType;
  expiryDate: Date;
  daysUntilExpiry: number; // negative if already expired
  status: CertStatus;
}

export interface AffectedStaff {
  userId: string;
  /** The most-severe status across this user's affected certs. */
  status: CertStatus;
  /** The earliest expiryDate across this user's affected certs. */
  earliestExpiry: Date;
  certs: AffectedCert[];
}

export interface CertExpirySummary {
  asOf: string; // ISO date — useful for the UI subtitle
  totals: {
    expired: number;
    critical: number;
    warning: number;
    upcoming: number;
  };
  /** All staff with at least one expired/critical/warning/upcoming cert. */
  affectedStaff: AffectedStaff[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const SEVERITY_ORDER: Record<CertStatus, number> = {
  expired: 4,
  critical: 3,
  warning: 2,
  upcoming: 1,
  valid: 0,
};

function classifyStatus(daysUntilExpiry: number): CertStatus {
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 7) return "critical";
  if (daysUntilExpiry <= 14) return "warning";
  if (daysUntilExpiry <= 30) return "upcoming";
  return "valid";
}

function daysUntil(expiry: Date, asOf: Date): number {
  // Floor to day precision so a cert expiring "today" reads as 0d
  // rather than -0.5d when the clock is mid-day.
  const start = new Date(asOf);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(expiry);
  end.setUTCHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function bucketCertExpiry(
  certs: CertInput[],
  asOf: Date,
): CertExpirySummary {
  const totals = { expired: 0, critical: 0, warning: 0, upcoming: 0 };
  const byUser = new Map<
    string,
    {
      status: CertStatus;
      earliestExpiry: Date;
      certs: AffectedCert[];
    }
  >();

  for (const c of certs) {
    if (!c.userId) continue; // centre-level certs aren't surfaced in the staff card
    const days = daysUntil(c.expiryDate, asOf);
    const status = classifyStatus(days);
    if (status === "valid") continue;

    // Bucket counts (overall service totals)
    totals[status as Exclude<CertStatus, "valid">] += 1;

    const cert: AffectedCert = {
      type: c.type,
      expiryDate: c.expiryDate,
      daysUntilExpiry: days,
      status,
    };

    const existing = byUser.get(c.userId);
    if (!existing) {
      byUser.set(c.userId, {
        status,
        earliestExpiry: c.expiryDate,
        certs: [cert],
      });
    } else {
      existing.certs.push(cert);
      if (SEVERITY_ORDER[status] > SEVERITY_ORDER[existing.status]) {
        existing.status = status;
      }
      if (c.expiryDate < existing.earliestExpiry) {
        existing.earliestExpiry = c.expiryDate;
      }
    }
  }

  const affectedStaff: AffectedStaff[] = [];
  for (const [userId, entry] of byUser) {
    // Sort each user's certs by severity (worst first), then earliest expiry.
    entry.certs.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[b.status] - SEVERITY_ORDER[a.status];
      if (sevDiff !== 0) return sevDiff;
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });
    affectedStaff.push({
      userId,
      status: entry.status,
      earliestExpiry: entry.earliestExpiry,
      certs: entry.certs,
    });
  }

  // Sort affected staff: worst status first, then earliest expiry.
  affectedStaff.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[b.status] - SEVERITY_ORDER[a.status];
    if (sevDiff !== 0) return sevDiff;
    return a.earliestExpiry.getTime() - b.earliestExpiry.getTime();
  });

  return {
    asOf: asOf.toISOString().split("T")[0],
    totals,
    affectedStaff,
  };
}

// ── Org-wide rollup (per-service) ─────────────────────────────────

export interface CertInputWithService extends CertInput {
  serviceId: string;
}

export interface ServiceRollupRow {
  serviceId: string;
  /** Worst status across all of this service's affected certs. */
  status: CertStatus;
  totals: {
    expired: number;
    critical: number;
    warning: number;
    upcoming: number;
  };
  /** Distinct count of staff at this service with at least one
   *  expired/critical/warning/upcoming cert. */
  affectedStaffCount: number;
}

export interface CertExpiryOrgRollup {
  asOf: string;
  /** Sum across all services. */
  orgTotals: {
    expired: number;
    critical: number;
    warning: number;
    upcoming: number;
  };
  /** Per-service rows, sorted worst-status-first then by total count.
   *  Services with zero affected certs are excluded. */
  services: ServiceRollupRow[];
}

/**
 * Org-wide aggregation for the leadership-page card. Groups certs by
 * `serviceId`, runs the per-service buckets, then collapses each
 * service into a single row with worst-status + counts.
 *
 * Services with zero affected certs are excluded from the rows array
 * — keeps the card focused on services that need attention.
 *
 * 2026-05-04: introduced for the leadership-page rollup card. The
 * per-service surface (PR #69) shows ONE centre at a time; this is
 * the State Manager's at-a-glance view of all 11 centres.
 */
export function bucketCertExpiryByService(
  certs: CertInputWithService[],
  asOf: Date,
): CertExpiryOrgRollup {
  // Bucket each service independently. Skip centre-level certs
  // (userId=null) up front — they wouldn't surface anyway, and
  // dropping them here keeps the per-service groups clean.
  const byService = new Map<string, CertInput[]>();
  for (const c of certs) {
    if (!c.userId) continue;
    const list = byService.get(c.serviceId) ?? [];
    list.push({ userId: c.userId, type: c.type, expiryDate: c.expiryDate });
    byService.set(c.serviceId, list);
  }

  const orgTotals = { expired: 0, critical: 0, warning: 0, upcoming: 0 };
  const services: ServiceRollupRow[] = [];

  for (const [serviceId, serviceCerts] of byService) {
    const summary = bucketCertExpiry(serviceCerts, asOf);
    const totalProblems =
      summary.totals.expired +
      summary.totals.critical +
      summary.totals.warning +
      summary.totals.upcoming;
    if (totalProblems === 0) continue;

    // Worst-status across the service is the same as the worst status
    // any of its affected staff have (which bucketCertExpiry already
    // sorts to position [0]).
    const worstStatus = summary.affectedStaff[0]?.status ?? "valid";

    services.push({
      serviceId,
      status: worstStatus,
      totals: summary.totals,
      affectedStaffCount: summary.affectedStaff.length,
    });

    orgTotals.expired += summary.totals.expired;
    orgTotals.critical += summary.totals.critical;
    orgTotals.warning += summary.totals.warning;
    orgTotals.upcoming += summary.totals.upcoming;
  }

  // Sort services: worst status first, then by total count desc.
  services.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[b.status] - SEVERITY_ORDER[a.status];
    if (sevDiff !== 0) return sevDiff;
    const aTotal =
      a.totals.expired + a.totals.critical + a.totals.warning + a.totals.upcoming;
    const bTotal =
      b.totals.expired + b.totals.critical + b.totals.warning + b.totals.upcoming;
    return bTotal - aTotal;
  });

  return {
    asOf: asOf.toISOString().split("T")[0],
    orgTotals,
    services,
  };
}
