import type { Role, TriageSubjectType } from "@prisma/client";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * Shared bits for the Knox API routes: the role list, subject-param parsing,
 * and the centre-scope checks. Out-of-scope records are always a 404, never a
 * 403, so a caller cannot probe for the existence of another centre's records.
 */

/**
 * Every Knox route is open to exactly these roles (the admin tier plus
 * coordinators), centre-scoped per request. Educators and everyone else: 403.
 */
export const KNOX_ROLES: Role[] = [...ADMIN_ROLES, "member"];

export const SUBJECT_TYPES = ["incident", "complaint", "staff_incident"] as const satisfies readonly TriageSubjectType[];

export const MAX_TIER_IDS = 200;

function parseSubjectType(raw: string): TriageSubjectType {
  const type = SUBJECT_TYPES.find((t) => t === raw);
  if (!type) throw ApiError.badRequest(`Unknown subject type: ${raw}`);
  return type;
}

/** Split `<type>:<rest>` on the first colon only (ids may not contain one, but be strict about the type). */
function splitTyped(raw: string, what: string): { type: TriageSubjectType; rest: string } {
  const idx = raw.indexOf(":");
  if (idx <= 0) throw ApiError.badRequest(`${what} must look like <type>:<id>`);
  const type = parseSubjectType(raw.slice(0, idx));
  const rest = raw.slice(idx + 1);
  if (!rest.trim()) throw ApiError.badRequest(`${what} must look like <type>:<id>`);
  return { type, rest };
}

/** `?subject=<type>:<id>` */
export function parseSubjectParam(raw: string): { type: TriageSubjectType; id: string } {
  const { type, rest } = splitTyped(raw, "subject");
  return { type, id: rest.trim() };
}

/** `?tiersFor=<type>:<id1>,<id2>,…` — de-duplicated, empties dropped, max 200. */
export function parseTiersForParam(raw: string): { type: TriageSubjectType; ids: string[] } {
  const { type, rest } = splitTyped(raw, "tiersFor");
  const ids = rest
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) throw ApiError.badRequest("tiersFor needs at least one id");
  if (ids.length > MAX_TIER_IDS) throw ApiError.badRequest(`tiersFor accepts at most ${MAX_TIER_IDS} ids`);
  return { type, ids: [...new Set(ids)] };
}

/** True when the record's service is visible to the caller (`null` = unscoped). */
export function isInScope(serviceIds: string[] | null, serviceId: string | null | undefined): boolean {
  if (serviceIds === null) return true;
  return !!serviceId && serviceIds.includes(serviceId);
}

/** Throws 404 when the record's service is outside the caller's scope. */
export function assertInScope(serviceIds: string[] | null, serviceId: string | null | undefined): void {
  if (!isInScope(serviceIds, serviceId)) throw ApiError.notFound();
}

/** Prisma `where` fragment for `serviceId`; empty for unscoped callers. */
export function scopeWhere(serviceIds: string[] | null): { serviceId?: { in: string[] } } {
  return serviceIds === null ? {} : { serviceId: { in: serviceIds } };
}

/** Body that may legitimately be absent: no body is `{}`, malformed JSON is still a 400. */
export async function parseOptionalJsonBody(req: Request): Promise<unknown> {
  const raw = await req.clone().text();
  if (!raw.trim()) return {};
  return parseJsonBody(req);
}
