import { prisma } from "@/lib/prisma";
import { CertificateType } from "@prisma/client";
import { ApiError } from "@/lib/api-error";

/**
 * Compliance certificates whose expiry blocks a shift assignment.
 *
 * - **WWCC** — legal floor for OSHC; cannot work with children without it.
 * - **First aid** — at least one first-aid-qualified educator must be on
 *   site every session per NQF 168(2)(a). Blocking on the per-shift level
 *   is conservative (a non-first-aider could legally cover IF a separate
 *   first-aider is on the same shift), but the rostering admin can
 *   override by extending the certificate's expiry in the compliance
 *   surface.
 * - **Food safety** — required when the assigned user is the kitchen
 *   lead. Today the roster doesn't track "kitchen role" granularly so
 *   we apply it broadly; the admin can update the cert's expiry to
 *   override or grant a partial role that doesn't need it.
 *
 * 2026-05-02: introduced as the third deliverable of the Connecteam-
 * style roster spec (PR #50 + #51 surfaced the issue visually; this
 * elevates it to API enforcement).
 * 2026-06-01: extended with visa-expiry blocking for staff on work /
 * student / bridging visas — Migration Act 1958 director liability.
 */
const BLOCKING_CERT_TYPES: CertificateType[] = [
  CertificateType.wwcc,
  CertificateType.first_aid,
  CertificateType.food_safety,
];

const CERT_TYPE_LABELS: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  food_safety: "Food Safety",
};

/**
 * Visa statuses that carry an enforceable expiry. Citizens and
 * permanent residents bypass the visa check (they don't have an
 * expiry that affects work rights). `other` is included defensively
 * — if an admin tagged a status we don't recognise, we'd rather
 * inspect the expiry than silently allow.
 */
const VISA_STATUSES_WITH_EXPIRY = new Set([
  "work_visa",
  "student_visa",
  "bridging_visa",
  "other",
]);

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Throws `ApiError.badRequest` (400) when the user has any blocking cert
 * (WWCC / First Aid / Food Safety) whose expiry is on or before the
 * shift date, OR a work-rights visa whose expiry is on or before the
 * shift date. Pure server-side gate; matches the visual-only badge
 * from PR #51 so the contract is consistent.
 *
 * - **Expired = blocked.** No override flag — to bypass, update the
 *   cert's `expiryDate` in the compliance surface or the user's
 *   `visaExpiry` in the staff profile (both leave an audit trail).
 * - **Missing certs are NOT currently blocked** here. A user with no
 *   `wwcc` row at all passes this check. That's a known gap; the chip
 *   prompt scoped this to "expires before the shift date" only.
 *   Followup work — see `next-priorities.md`.
 * - Superseded certificates (replaced by a renewal) are skipped.
 *   The active cert is whichever row has `supersededAt = null`.
 * - **Visa**: citizens + permanent residents bypass the check.
 *   Work / student / bridging visas block when their `visaExpiry`
 *   is on or before the shift date.
 */
export async function assertStaffCertsValidForShift({
  userId,
  shiftDate,
}: {
  userId: string;
  shiftDate: Date;
}): Promise<void> {
  // Fetch user (for visa fields) + certs in parallel — single round-trip.
  const [user, certs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { visaStatus: true, visaExpiry: true },
    }),
    prisma.complianceCertificate.findMany({
      where: {
        userId,
        supersededAt: null,
        type: { in: BLOCKING_CERT_TYPES },
      },
      select: { type: true, expiryDate: true },
    }),
  ]);

  const expired: { type: string; expiryDate: Date }[] = [];

  // Cert pass.
  for (const c of certs) {
    if (c.expiryDate === null) continue; // No-expiry certs never block.
    if (c.expiryDate.getTime() <= shiftDate.getTime()) {
      expired.push({ type: c.type, expiryDate: c.expiryDate });
    }
  }

  // Visa pass — only when the user is on a visa with an enforceable
  // expiry. Citizens / PRs / null visaStatus all pass through.
  if (
    user?.visaStatus &&
    VISA_STATUSES_WITH_EXPIRY.has(user.visaStatus) &&
    user.visaExpiry &&
    user.visaExpiry.getTime() <= shiftDate.getTime()
  ) {
    expired.push({ type: "visa", expiryDate: user.visaExpiry });
  }

  if (expired.length === 0) return;

  const parts = expired
    .map((c) => {
      const label =
        c.type === "visa"
          ? "Work visa"
          : CERT_TYPE_LABELS[c.type] ?? c.type;
      return `${label} (expired ${fmtDate(c.expiryDate)})`;
    })
    .join(", ");

  throw ApiError.badRequest(
    `Cannot assign this shift — staff member has expired compliance certificates or visa: ${parts}. Renew (or update the expiry in the staff profile) before assigning.`,
  );
}
