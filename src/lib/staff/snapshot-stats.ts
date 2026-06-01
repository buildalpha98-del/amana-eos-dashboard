/**
 * Pure helper that computes the at-a-glance stats for the right-side
 * snapshot panel on the new long-scroll staff profile (PR 3 of the
 * Teams tab redesign). Takes already-fetched data; no DB calls.
 *
 * Cert classification matches the existing `getCertStatus` helper:
 * valid > 30 days, expiring ≤ 30 days, expired (negative).
 *
 * Tenure is computed from the earliest of `User.createdAt` and the
 * earliest `EmploymentContract.startDate` — whichever is older —
 * rendered as "X years Y months".
 *
 * 2026-05-04: introduced (spec PR #77, PR 3).
 */

import { getCertStatus } from "@/lib/cert-status";

export interface SnapshotStatsInput {
  user: { createdAt: Date };
  earliestContractStart: Date | null;
  nextShift: {
    date: Date;
    shiftStart: string;
    shiftEnd: string;
    sessionType: string;
    service?: { name: string } | null;
  } | null;
  // expiryDate is nullable per the schema migration ("No expiry" certs).
  // "missing" certs aren't counted in any bucket (see loop below).
  certificates: Array<{ expiryDate: Date | null }>;
  activeRocks: number;
  openTodos: number;
}

export interface SnapshotStats {
  /** "0 years 3 months" — never empty. */
  tenure: string;
  /** Pre-formatted label: "Mon 5 May, 3-6pm · ASC · Mawson". `null` →
   *  render the "No upcoming shift" placeholder; do not collapse the
   *  block (preserves panel layout consistency). */
  nextShiftLabel: string | null;
  certCounts: {
    valid: number;
    expiring: number;
    expired: number;
  };
  activeRocks: number;
  openTodos: number;
}

const SESSION_LABEL: Record<string, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

function tenureDescription(start: Date, asOf: Date): string {
  // Year + month delta with carry on negative-month boundary.
  let years = asOf.getUTCFullYear() - start.getUTCFullYear();
  let months = asOf.getUTCMonth() - start.getUTCMonth();
  if (asOf.getUTCDate() < start.getUTCDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) {
    years = 0;
    months = 0;
  }
  const yearLabel = years === 1 ? "1 year" : `${years} years`;
  const monthLabel = months === 1 ? "1 month" : `${months} months`;
  return `${yearLabel} ${monthLabel}`;
}

function formatNextShiftLabel(
  shift: SnapshotStatsInput["nextShift"],
): string | null {
  if (!shift) return null;
  const dateLabel = new Date(shift.date).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const session =
    SESSION_LABEL[shift.sessionType] ?? shift.sessionType.toUpperCase();
  const service = shift.service?.name ? ` · ${shift.service.name}` : "";
  return `${dateLabel}, ${shift.shiftStart}–${shift.shiftEnd} · ${session}${service}`;
}

export function computeSnapshotStats(
  input: SnapshotStatsInput,
  asOf: Date = new Date(),
): SnapshotStats {
  // Tenure: earlier of user.createdAt and earliestContractStart.
  const tenureStart =
    input.earliestContractStart &&
    input.earliestContractStart < input.user.createdAt
      ? input.earliestContractStart
      : input.user.createdAt;

  const certCounts = { valid: 0, expiring: 0, expired: 0 };
  for (const c of input.certificates) {
    const { status } = getCertStatus(c.expiryDate);
    if (status === "valid") certCounts.valid += 1;
    else if (status === "expiring") certCounts.expiring += 1;
    else if (status === "expired") certCounts.expired += 1;
    // "missing" certs (null expiryDate) aren't counted in any bucket.
  }

  return {
    tenure: tenureDescription(tenureStart, asOf),
    nextShiftLabel: formatNextShiftLabel(input.nextShift),
    certCounts,
    activeRocks: input.activeRocks,
    openTodos: input.openTodos,
  };
}
