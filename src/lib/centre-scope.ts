import type { Session } from "next-auth";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EOS_ROLES } from "@/lib/role-enum";

// ---------------------------------------------------------------------------
// Roles that always see ALL data (no centre filtering)
// ---------------------------------------------------------------------------
// EOS roles (viewer / implementer) are organisation-wide: they run/observe
// EOS across every centre, so they get the unscoped (null) filter rather
// than falling through to the "no centre assigned" empty scope.
//
// 2026-07-13: State Managers (head_office) removed from this list per
// Daniel's request — they now only see the centres they've been attached
// to via UserServiceMembership. The "Add Centre" button is separately
// hidden for them in the /services UI and blocked at POST /api/services.
const UNSCOPED_ROLES: readonly Role[] = ["owner", ...EOS_ROLES];

// ---------------------------------------------------------------------------
// Roles scoped to their assigned centres
// ---------------------------------------------------------------------------
// head_office (State Manager) — their UserServiceMembership rows
// member (Coordinator) — primary serviceId + services where they are managerId + memberships
// staff (Educator) — primary serviceId + memberships
// marketing — primary serviceId only (kept narrow; the services LIST is
//   still unscoped for marketing via api/services/route.ts skipping getCentreScope)
// admin — scoped by state (handled separately via getStateScope)
// ---------------------------------------------------------------------------

/**
 * Fetch the active additional-service memberships for a user.
 * Returns the list of serviceIds the user has been attached to via the
 * /team → additional services flow (excluding disabled/expired rows).
 */
async function fetchActiveMembershipServiceIds(
  userId: string,
): Promise<string[]> {
  const rows = await prisma.userServiceMembership.findMany({
    where: { userId, status: "active" },
    select: { serviceId: true },
  });
  return rows.map((r) => r.serviceId);
}

/**
 * Resolves which service IDs the current user is authorised to view.
 *
 * Returns `null` for unscoped roles (owner + EOS roles) — meaning no filter.
 * Returns an array of service IDs for scoped roles.
 *
 * NOTE: For head_office / member this performs a DB query. Cache the
 * result per-request if calling multiple times.
 */
export async function getCentreScope(
  session: Session | null,
): Promise<{ serviceIds: string[] | null }> {
  if (!session?.user) return { serviceIds: [] };

  const role = session.user.role as Role;

  // Owner + EOS roles always see everything
  if (UNSCOPED_ROLES.includes(role)) {
    return { serviceIds: null };
  }

  // Admin: scoped by state — handled downstream with getStateScope.
  // Return null here so state-based filtering applies instead of serviceId filtering.
  if (role === "admin") {
    return { serviceIds: null };
  }

  const userId = session.user.id as string;
  const userServiceId = session.user.serviceId as string | undefined;

  // State Manager (head_office): scoped to whichever centres they've been
  // attached to via UserServiceMembership. No primary serviceId concept for
  // head_office — they're not "based" at a single centre.
  if (role === "head_office") {
    const memberships = await fetchActiveMembershipServiceIds(userId);
    return { serviceIds: memberships };
  }

  // Coordinator: primary + managed + memberships
  if (role === "member") {
    const [managed, memberships] = await Promise.all([
      prisma.service.findMany({
        where: { managerId: userId },
        select: { id: true },
      }),
      fetchActiveMembershipServiceIds(userId),
    ]);
    const ids = new Set<string>();
    if (userServiceId) ids.add(userServiceId);
    for (const s of managed) ids.add(s.id);
    for (const id of memberships) ids.add(id);
    return { serviceIds: Array.from(ids) };
  }

  // Educator: primary + memberships
  if (role === "staff") {
    const memberships = await fetchActiveMembershipServiceIds(userId);
    const ids = new Set<string>();
    if (userServiceId) ids.add(userServiceId);
    for (const id of memberships) ids.add(id);
    return { serviceIds: Array.from(ids) };
  }

  // marketing: primary serviceId only (services list bypasses this
  // helper via marketing-specific skip in api/services/route.ts).
  if (userServiceId) {
    return { serviceIds: [userServiceId] };
  }

  // No serviceId assigned — return empty array (see nothing service-specific)
  return { serviceIds: [] };
}

/**
 * Merges a centre scope filter into an existing Prisma `where` clause.
 *
 * @param where   The existing Prisma where object (mutated in place and returned)
 * @param serviceIds  The result from getCentreScope — null means no filter
 * @param field   The field name that holds the serviceId (default: "serviceId")
 * @returns The (possibly modified) where clause
 *
 * If `serviceIds` is null, no filter is applied (owner / EOS see all).
 * If `serviceIds` has one entry, uses direct equality.
 * If `serviceIds` has multiple entries, uses `{ in: [...] }`.
 * If `serviceIds` is empty, adds an impossible filter so no results are returned.
 */
export function applyCentreFilter<T extends Record<string, unknown>>(
  where: T,
  serviceIds: string[] | null,
  field: string = "serviceId",
): T {
  if (serviceIds === null) return where; // no filtering for owner+

  if (serviceIds.length === 0) {
    // No centres assigned — return nothing
    (where as Record<string, unknown>)[field] = "__no_access__";
    return where;
  }

  if (serviceIds.length === 1) {
    (where as Record<string, unknown>)[field] = serviceIds[0];
  } else {
    (where as Record<string, unknown>)[field] = { in: serviceIds };
  }

  return where;
}

/**
 * Convenience: builds an OR clause for queries where the user should also see
 * records assigned to them personally (not just their centre's records).
 *
 * For unscoped roles returns undefined (no additional filtering needed).
 */
export function buildCentreOrPersonalFilter(
  serviceIds: string[] | null,
  userId: string,
  serviceField: string = "serviceId",
  userField: string = "assigneeId",
): Record<string, unknown>[] | undefined {
  if (serviceIds === null) return undefined; // unscoped

  const conditions: Record<string, unknown>[] = [
    { [userField]: userId },
  ];

  if (serviceIds.length === 1) {
    conditions.push({ [serviceField]: serviceIds[0] });
  } else if (serviceIds.length > 1) {
    conditions.push({ [serviceField]: { in: serviceIds } });
  }

  return conditions;
}
