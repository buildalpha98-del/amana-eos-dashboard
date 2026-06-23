/**
 * Single source of truth for the Role enum at runtime.
 *
 * Prisma exposes `Role` as a TypeScript union (string literal type), but
 * its values aren't reachable as a runtime array — so route handlers that
 * accept role-shaped query strings can't iterate or `.includes()` against
 * the type alone. This module bridges that gap.
 *
 * 2026-05-01: introduced after spotting two parallel-but-divergent
 * `VALID_ROLES` arrays — one with a duplicate "member" entry left over
 * from the coordinator → member rename — and an unvalidated `as any`
 * cast on `/api/users?role=…` that let arbitrary URL strings reach
 * Prisma's where clause (Prisma errors out, so it's a 500-not-400 bug
 * rather than a security leak).
 */

import type { Role } from "@prisma/client";

/**
 * Authoritative, deduped list. Mirror of the schema enum in the order it
 * appears in `prisma/schema.prisma`. Update both at the same time.
 */
export const ROLES: readonly Role[] = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "member",
  "staff",
  "eos_viewer",
  "eos_implementer",
] as const;

const ROLE_SET: Set<string> = new Set(ROLES);

/**
 * The EOS-only roles: organisation-wide access to the EOS surface and
 * nothing else. `eos_viewer` is read-only (coaches / board observers);
 * `eos_implementer` has full write access (runs L10s, owns rocks /
 * scorecard / todos). Both are unscoped (not centre- or state-bound) and
 * are the source of truth for the EOS scope/nav/dashboard branches.
 */
export const EOS_ROLES: readonly Role[] = ["eos_viewer", "eos_implementer"] as const;

/** Is this an EOS-only role (viewer or implementer)? */
export function isEosRole(role: string | null | undefined): boolean {
  return role === "eos_viewer" || role === "eos_implementer";
}

/** Type guard. Narrows `value` to `Role` when it's a known enum value. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLE_SET.has(value);
}

/**
 * Coerce a query-string value to a `Role`, returning `null` for anything
 * that's not in the enum. Use this in place of `value as Role` / `as any`.
 *
 * Centralised so the enum's runtime array can't drift out of sync with
 * the Prisma schema (and so a duplicate-entry typo in one route doesn't
 * silently survive the next refactor).
 */
export function parseRoleParam(value: string | null | undefined): Role | null {
  if (!value) return null;
  return isRole(value) ? value : null;
}
