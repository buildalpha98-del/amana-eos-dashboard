/**
 * Pure builder for the Prisma `User` where clause used by `/api/employees`.
 *
 * Composes search, status, multi-select service, multi-select role, and the
 * caller's centre scope. Service-scope intersection is defense-in-depth:
 * even if a scoped caller smuggles a different `s=` value into the URL, the
 * resulting filter is the intersection of the requested ids with the
 * caller's permitted ids — never the union.
 *
 * Role values are validated at runtime via `isRole` (single source of
 * truth — see `src/lib/role-enum.ts`). Unknown role tokens are silently
 * dropped so a typo'd URL still returns sensible results; if every passed
 * role is junk, no role filter is applied.
 *
 * Sort columns are whitelisted via `isValidSort`. The route also enforces
 * the same set with a Zod enum, but `isValidSort` stays exported for any
 * future caller that builds queries dynamically.
 *
 * 2026-05-04: introduced for the Teams tab redesign (PR 1).
 */

import type { Prisma } from "@prisma/client";
import { isRole } from "@/lib/role-enum";
import { normaliseTag } from "@/lib/staff-tags";

export interface ListQueryParams {
  q?: string;
  status?: string; // "active" | "pending" | "deactivated"
  s?: string; // comma-separated serviceIds
  r?: string; // comma-separated roles
  /** Comma-separated tag values. Multiple tags = AND (must have all). */
  tag?: string;
}

export interface BuildListWhereInput {
  params: ListQueryParams;
  /** From getCentreScope. null = caller has org-wide access. */
  scopedServiceIds: string[] | null;
  /** When true and no status filter is passed, exclude deactivated. */
  hideDeactivatedByDefault?: boolean;
}

const VALID_SORTS = new Set(["name", "role", "service", "status"]);

export function isValidSort(value: string): boolean {
  return VALID_SORTS.has(value);
}

export function buildListWhere(
  input: BuildListWhereInput,
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  const { params, scopedServiceIds, hideDeactivatedByDefault } = input;

  // Search (name + email substring, case-insensitive)
  if (params.q && params.q.trim()) {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { email: { contains: params.q, mode: "insensitive" } },
    ];
  }

  // Status
  if (params.status === "active") {
    where.active = true;
    where.lastLoginAt = { not: null };
  } else if (params.status === "pending") {
    where.active = true;
    where.lastLoginAt = null;
  } else if (params.status === "deactivated") {
    where.active = false;
  } else if (hideDeactivatedByDefault) {
    where.active = true;
  }

  // Service filter — matches either the user's primary serviceId OR any
  // active UserServiceMembership. 2026-07-08: previously only checked
  // primary; staff added to a centre via /services/[id]/staff (which
  // creates a UserServiceMembership row) never showed up when filtering
  // /team by that centre. Applies to both the requested-services filter
  // AND the caller's centre scope so a member/staff still sees every
  // colleague at their centre — including primary-elsewhere users.
  const requestedServices = params.s?.split(",").filter(Boolean) ?? [];
  const buildServiceIdOr = (ids: string[]) => [
    { serviceId: { in: ids } },
    {
      serviceMemberships: {
        some: { serviceId: { in: ids }, status: "active" as const },
      },
    },
  ];

  if (requestedServices.length > 0 && scopedServiceIds !== null) {
    const intersection = requestedServices.filter((id) =>
      scopedServiceIds.includes(id),
    );
    // AND on top of any existing OR (search): fold into `AND`.
    // Apply even when the intersection is EMPTY — a scoped caller filtering
    // by an out-of-scope service must match nothing, not escape their scope
    // (skipping the constraint here silently returned every employee).
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: buildServiceIdOr(intersection) },
    ];
  } else if (requestedServices.length > 0) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: buildServiceIdOr(requestedServices) },
    ];
  } else if (scopedServiceIds !== null) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: buildServiceIdOr(scopedServiceIds) },
    ];
  }

  // Role filter — validate every value against the runtime enum.
  // Unknown values are dropped (not 400-ed) so a typo'd URL still
  // returns a sensible result; if the caller passes ONLY junk, the
  // filter ends up applying nothing, which is fine.
  const requestedRoles = (params.r?.split(",") ?? [])
    .map((r) => r.trim())
    .filter(Boolean)
    .filter(isRole);
  if (requestedRoles.length > 0) {
    where.role = { in: requestedRoles };
  }

  // Tag filter — normalise each requested tag and require ALL of them
  // on the user (`hasEvery`). AND semantics mirror the existing
  // multi-select role/service chips ("matches X AND Y", not "matches
  // X OR Y"). Tags that fail normalisation are dropped silently.
  const requestedTags = (params.tag?.split(",") ?? [])
    .map((t) => normaliseTag(t))
    .filter((t): t is string => t !== null);
  if (requestedTags.length > 0) {
    where.tags = { hasEvery: requestedTags };
  }

  return where;
}
