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

export interface ListQueryParams {
  q?: string;
  status?: string; // "active" | "pending" | "deactivated"
  s?: string; // comma-separated serviceIds
  r?: string; // comma-separated roles
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

  // Service filter (intersect with scope when caller is scoped)
  const requestedServices = params.s?.split(",").filter(Boolean) ?? [];
  if (requestedServices.length > 0 && scopedServiceIds !== null) {
    const intersection = requestedServices.filter((id) =>
      scopedServiceIds.includes(id),
    );
    where.serviceId = { in: intersection };
  } else if (requestedServices.length > 0) {
    where.serviceId = { in: requestedServices };
  } else if (scopedServiceIds !== null) {
    where.serviceId = { in: scopedServiceIds };
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

  return where;
}
