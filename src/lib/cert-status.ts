export type CertStatus = "valid" | "expiring" | "expired" | "missing";

export interface CertStatusResult {
  status: CertStatus;
  daysLeft: number | null;
}

/**
 * Compute the status of a compliance certificate based on its expiry date.
 *
 * - missing: no expiry date recorded
 * - expired: expiry is in the past
 * - expiring: expiry within 30 days
 * - valid: expiry more than 30 days out
 *
 * `asOf` is the reference date to classify against (defaults to the real clock).
 * Callers computing a point-in-time snapshot MUST pass their as-of date so the
 * result is deterministic rather than drifting with the wall clock.
 */
export function getCertStatus(
  expiryDate: Date | null,
  asOf: Date = new Date(),
): CertStatusResult {
  if (!expiryDate) {
    return { status: "missing", daysLeft: null };
  }

  const now = new Date(asOf);
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / msPerDay);

  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= 30) return { status: "expiring", daysLeft };
  return { status: "valid", daysLeft };
}
