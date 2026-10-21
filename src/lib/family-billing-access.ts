/**
 * Family billing and account details are office information, not floor
 * information (Daniel, 2026-10-21: "the only thing educators should be able
 * to see is just child attendances and stuff").
 *
 * Educators (`staff`) never receive: session fees and fee totals, discounts,
 * CRNs (the child's and the parents' — they exist for CCS billing). They
 * still see everything they need on the floor: attendance, room/days,
 * medical, contacts and authorised pickups.
 *
 * Owner, head office, admin and the centre's Coordinator / centre login
 * (`member`) keep seeing billing. Bank details are narrower still — owner and
 * admin only (`canSeeBankDetails` in src/lib/payment-details.ts).
 *
 * Enforced where the data leaves the server (child page, child API,
 * attendances API, weekly roll); the screens hide what they no longer get.
 */
import { isAdminRole } from "@/lib/role-permissions";

export function canSeeFamilyBilling(user: { role?: string | null } | null | undefined): boolean {
  const role = user?.role ?? "";
  return isAdminRole(role) || role === "member";
}

/** A parent JSON object (primaryParent / secondaryParent) without its CRN. */
function withoutCrn(parent: unknown): unknown {
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) return parent;
  const { crn: _crn, ...rest } = parent as Record<string, unknown>;
  return rest;
}

/**
 * Strip billing fields from a child record (and its enrolment's parents) for
 * a viewer who may not see them. Returns the input untouched for everyone else.
 */
export function redactChildBilling<
  T extends { crn?: string | null; enrolment?: { primaryParent?: unknown; secondaryParent?: unknown } | null },
>(user: Parameters<typeof canSeeFamilyBilling>[0], child: T): T {
  if (canSeeFamilyBilling(user)) return child;
  return {
    ...child,
    crn: null,
    enrolment: child.enrolment
      ? {
          ...child.enrolment,
          ...("primaryParent" in child.enrolment ? { primaryParent: withoutCrn(child.enrolment.primaryParent) } : {}),
          ...("secondaryParent" in child.enrolment ? { secondaryParent: withoutCrn(child.enrolment.secondaryParent) } : {}),
        }
      : child.enrolment,
  };
}
