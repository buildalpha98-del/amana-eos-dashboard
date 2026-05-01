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
 * shift date. Pure server-side gate; matches the visual-only badge from
 * PR #51 so the contract is consistent.
 *
 * - **Expired = blocked.** No override flag — to bypass, update the
 *   cert's `expiryDate` in the compliance surface (which intentionally
 *   leaves an audit trail).
 * - **Missing certs are NOT currently blocked** here. A user with no
 *   `wwcc` row at all passes this check. That's a known gap; the chip
 *   prompt scoped this to "expires before the shift date" only.
 *   Followup work — see `next-priorities.md`.
 * - Superseded certificates (replaced by a renewal) are skipped.
 *   The active cert is whichever row has `supersededAt = null`.
 */
export async function assertStaffCertsValidForShift({
  userId,
  shiftDate,
}: {
  userId: string;
  shiftDate: Date;
}): Promise<void> {
  // Pull every blocking cert for this user; we filter client-side rather
  // than letting Prisma do `expiryDate <= shiftDate` so the error message
  // can list each expired cert with its date.
  const certs = await prisma.complianceCertificate.findMany({
    where: {
      userId,
      supersededAt: null,
      type: { in: BLOCKING_CERT_TYPES },
    },
    select: { type: true, expiryDate: true },
  });

  const expired: { type: string; expiryDate: Date }[] = [];
  for (const c of certs) {
    if (c.expiryDate.getTime() <= shiftDate.getTime()) {
      expired.push({ type: c.type, expiryDate: c.expiryDate });
    }
  }

  if (expired.length === 0) return;

  // One readable line: "WWCC (expired 12 Apr 2026), First Aid (expired 1 May 2026)"
  const parts = expired
    .map((c) => `${CERT_TYPE_LABELS[c.type] ?? c.type} (expired ${fmtDate(c.expiryDate)})`)
    .join(", ");

  throw ApiError.badRequest(
    `Cannot assign this shift — staff member has expired compliance certificates: ${parts}. Renew the certificate (or update the expiry date in compliance) before assigning.`,
  );
}
