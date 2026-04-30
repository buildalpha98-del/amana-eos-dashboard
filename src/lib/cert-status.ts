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
 */
export function getCertStatus(expiryDate: Date | null): CertStatusResult {
  if (!expiryDate) {
    return { status: "missing", daysLeft: null };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / msPerDay);

  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= 30) return { status: "expiring", daysLeft };
  return { status: "valid", daysLeft };
}
