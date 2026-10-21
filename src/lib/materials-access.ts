/**
 * Who sees and works materials orders: the admin tier for every centre; a
 * coordinator (member) for their own centre — they answer "Centre has it?"
 * and mark deliveries received. Ordering and carts are head office's.
 */
import { isAdminRole } from "@/lib/role-permissions";
import { ApiError } from "@/lib/api-error";

type S = { user: { role?: string | null; serviceId?: string | null } };

export function materialsScope(session: S): string[] | null {
  if (isAdminRole(session.user.role)) return null;
  if (session.user.role === "member" && session.user.serviceId) return [session.user.serviceId];
  throw ApiError.forbidden("Materials orders are for coordinators and head office.");
}

export function assertMaterialsCentre(session: S, serviceId: string) {
  const scope = materialsScope(session);
  if (scope && !scope.includes(serviceId)) throw ApiError.forbidden("This centre isn't yours.");
}

export const MATERIALS_ROLES = ["owner", "head_office", "admin", "member"] as const;
