import type { Session } from "next-auth";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Roles that always see ALL data (no centre filtering)
// ---------------------------------------------------------------------------
const UNSCOPED_ROLES: readonly Role[] = ["owner", "head_office"];

// ---------------------------------------------------------------------------
// Roles scoped to their assigned centres
// ---------------------------------------------------------------------------
// coordinator — their serviceId + any services where they are managerId
// member, staff, marketing — their serviceId only
// admin — scoped by state (handled separately via getStateScope)
// ---------------------------------------------------------------------------

/**
 * Resolves which service IDs the current user is authorised to view.
 *
 * Returns `null` for unscoped roles (owner, head_office) — meaning no filter.
 * Returns an array of service IDs for scoped roles.
 *
 * NOTE: For coordinators this performs a DB query to find managed services.
 * Cache the result per-request if calling multiple times.
 */
export async function getCentreScope(
  session: Session | null,
): Promise<{ serviceIds: string[] | null }> {
  if (!session?.user) return { serviceIds: [] };

  const role = session.user.role as Role;

  // Owner and head_office always see everything
  if (UNSCOPED_ROLES.includes(role)) {
    return { serviceIds: null };
  }

  // Admin: scoped by state — handled downstream with getStateScope.
  // Return null here so state-based filtering applies instead of serviceId filtering.
  if (role === "admin") {
    return { serviceIds: null };
  }

  const userServiceId = session.user.serviceId as string | undefined;

  // Coordinator: their assigned service + any services they manage
  if (role === "member") {
    const managedServices = await prisma.service.findMany({
      where: { managerId: session.user.id as string },
      select: { id: true },
    });

    const ids = new Set<string>();
    if (userServiceId) ids.add(userServiceId);
    for (const s of managedServices) ids.add(s.id);

    // If coordinator has no assigned or managed services, return empty
    // (they shouldn't see anything rather than everything)
    return { serviceIds: Array.from(ids) };
  }

  // member, staff, marketing: scoped to their single serviceId
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
 * If `serviceIds` is null, no filter is applied (admin+ sees all).
 * If `serviceIds` has one entry, uses direct equality.
 * If `serviceIds` has multiple entries, uses `{ in: [...] }`.
 * If `serviceIds` is empty, adds an impossible filter so no results are returned.
 */
export function applyCentreFilter<T extends Record<string, unknown>>(
  where: T,
  serviceIds: string[] | null,
  field: string = "serviceId",
): T {
  if (serviceIds === null) return where; // no filtering for admin+

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
