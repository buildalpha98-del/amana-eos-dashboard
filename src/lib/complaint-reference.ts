import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * CMP-YYYY-NNNN generator — the reference a complaint is discussed by.
 *
 * Same shape as the creative-request numbers: count-per-year, a unique
 * constraint in the database, and bounded retry at the call site. The
 * count can race under concurrent intake; the unique index is what
 * actually guarantees correctness, and the retry turns that collision
 * into a second attempt rather than a failed intake.
 *
 * A human-readable reference matters more here than elsewhere. A family
 * ringing back about a complaint says "CMP-2026-0007", not a cuid, and a
 * regulator asking about a notification expects a reference that appears
 * on the correspondence.
 */
export async function generateComplaintReference(
  tx: Pick<PrismaClient | Prisma.TransactionClient, "complaintRecord">,
  year: number,
): Promise<string> {
  const count = await tx.complaintRecord.count({
    where: { reference: { startsWith: `CMP-${year}-` } },
  });
  return formatComplaintReference(year, count + 1);
}

export function formatComplaintReference(
  year: number,
  sequence: number,
): string {
  return `CMP-${year}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Run `attempt` with a freshly generated reference, retrying on a unique
 * violation.
 *
 * Only P2002 is retried — any other failure is a real error and must
 * surface rather than being tried three times.
 */
export async function createWithReferenceRetry<T>(
  attempt: (reference: string) => Promise<T>,
  generate: () => Promise<string>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const reference = await generate();
    try {
      return await attempt(reference);
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Categories a complaint is filed under. Data, so it can be reported on. */
export const COMPLAINT_CATEGORIES = [
  { value: "child_safety", label: "Child safety" },
  { value: "supervision", label: "Supervision" },
  { value: "staff_conduct", label: "Staff conduct" },
  { value: "fee", label: "Fees and billing" },
  { value: "food", label: "Food and nutrition" },
  { value: "program", label: "Program and activities" },
  { value: "communication", label: "Communication" },
  { value: "facilities", label: "Facilities" },
  { value: "other", label: "Other" },
] as const;

/**
 * The two limbs of s.174(2)(b).
 *
 * A complaint is notifiable if it ALLEGES one of these — the allegation
 * is the trigger, not whether it turns out to be true. Services get this
 * wrong in the direction that costs them: they investigate first, decide
 * it was unfounded, and never notify, by which point the 24 hours is
 * long gone.
 */
export const NOTIFIABLE_REASONS = [
  {
    value: "serious_incident",
    label: "Alleges a serious incident has occurred or is occurring",
  },
  {
    value: "law_contravention",
    label: "Alleges the National Law or Regulations have been contravened",
  },
] as const;

export const COMPLAINT_STATUSES = [
  "new",
  "acknowledged",
  "investigating",
  "resolved",
  "closed",
  "escalated",
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
