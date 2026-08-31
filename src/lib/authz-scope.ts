import type { Session } from "next-auth";
import { isAdminRole } from "@/lib/role-permissions";
import { ApiError } from "@/lib/api-error";

/**
 * Centre-scope authorization for API routes handling per-service records
 * (children, enrolments, bookings, billing, rosters, leave...).
 *
 * Security model (2026-07-12 authz sweep) — matches the long-standing
 * `children/[id]/attendances` pattern and FAILS CLOSED:
 *
 *   - owner / head_office / admin  → full cross-centre access (isAdminRole)
 *   - every other role (member/staff/marketing/eos_*) → may only touch
 *     records whose serviceId equals THEIR OWN session.user.serviceId.
 *
 * A non-admin with no serviceId (EOS/marketing org-wide roles, or an
 * unassigned account) is denied — org-wide roles have no business reading
 * a specific centre's child-medical / family-PII data, and denying an
 * unassigned member is the safe default.
 *
 * Note on multi-centre staff: this intentionally scopes to the PRIMARY
 * serviceId only, not additional UserServiceMembership rows (per the
 * 2026-07-12 decision). A staff member with a secondary membership is
 * blocked from that second centre's per-child routes — fail-closed is the
 * correct direction for child-safety data; widen deliberately later if a
 * real workflow needs it.
 */

/** True when the session may access records for `recordServiceId`. */
export function canAccessService(
  session: Session | null,
  recordServiceId: string | null | undefined,
): boolean {
  const role = session?.user?.role ?? "";
  if (isAdminRole(role)) return true;
  const viewerServiceId = (session?.user?.serviceId as string | undefined) ?? null;
  return viewerServiceId !== null && viewerServiceId === recordServiceId;
}

/**
 * Throw 403 unless the session may access `recordServiceId`. Use in
 * fetch-by-id handlers after loading the record's serviceId.
 */
export function assertServiceAccess(
  session: Session | null,
  recordServiceId: string | null | undefined,
): void {
  if (!canAccessService(session, recordServiceId)) {
    throw ApiError.forbidden();
  }
}

/**
 * Sentinel serviceId that matches no real row — used to force a
 * non-admin's list query to return nothing when they have no serviceId,
 * rather than silently returning all rows.
 */
export const NO_SERVICE_MATCH = "__no_service_scope__";

/**
 * A `serviceId` where-clause fragment that scopes a LIST query to the
 * caller's centre. Spread into a Prisma `where`:
 *
 *   where: { deleted: false, ...serviceScopeFilter(session) }
 *
 *   - admin roles → `{}` (no restriction)
 *   - non-admin with serviceId → `{ serviceId }`
 *   - non-admin without serviceId → `{ serviceId: NO_SERVICE_MATCH }` (empty result)
 *
 * A caller-supplied `?serviceId=` filter must be intersected on TOP of
 * this (never used instead of it) so a scoped user can narrow within
 * their centre but never widen beyond it — see `resolveServiceIdFilter`.
 */
export function serviceScopeFilter(
  session: Session | null,
): Record<string, never> | { serviceId: string } {
  const role = session?.user?.role ?? "";
  if (isAdminRole(role)) return {};
  const viewerServiceId = (session?.user?.serviceId as string | undefined) ?? null;
  return { serviceId: viewerServiceId ?? NO_SERVICE_MATCH };
}

/**
 * Resolve the effective `serviceId` filter for a list route that accepts a
 * `?serviceId=` (or `?s=`) query param, honouring the caller's scope:
 *
 *   - admin: the requested serviceId if given, else undefined (all centres)
 *   - non-admin: ALWAYS their own serviceId; a requested serviceId is only
 *     honoured when it equals their own (otherwise they'd escape scope —
 *     this is the exact hole the buildListWhere fix closed). A mismatching
 *     request yields NO_SERVICE_MATCH (empty result), never a wider set.
 *
 * Returns the serviceId string to filter by, or `undefined` for "no filter".
 */
export function resolveServiceIdFilter(
  session: Session | null,
  requestedServiceId: string | null | undefined,
): string | undefined {
  const role = session?.user?.role ?? "";
  if (isAdminRole(role)) {
    return requestedServiceId || undefined;
  }
  const viewerServiceId = (session?.user?.serviceId as string | undefined) ?? null;
  if (viewerServiceId === null) return NO_SERVICE_MATCH;
  if (requestedServiceId && requestedServiceId !== viewerServiceId) {
    return NO_SERVICE_MATCH;
  }
  return viewerServiceId;
}
