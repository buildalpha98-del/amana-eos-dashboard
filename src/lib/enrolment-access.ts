/**
 * Who may open or change ONE enrolment submission (2026-10-08).
 *
 * `/api/enrolments/[id]` (GET/PATCH) and its PDF had no role or centre
 * check at all — any signed-in account, educators included, could read
 * any family's pack (medical, custody, parents) or mark it processed,
 * which activates the children and generates bookings.
 *
 * Admin tier: any. Director of Service (`member`): their own centre's
 * only. Unassigned submissions (no serviceId) are admin-only — they
 * belong to the office until someone places them. Everyone else: no.
 */
import type { Session } from "next-auth";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

export function canAccessEnrolment(
  session: Session | null,
  serviceId: string | null | undefined,
): boolean {
  const role = session?.user?.role ?? "";
  if (isAdminRole(role)) return true;
  if (role !== "member") return false;
  const own = (session?.user as { serviceId?: string | null } | undefined)?.serviceId ?? null;
  return own !== null && own === serviceId;
}

export function assertEnrolmentAccess(
  session: Session | null,
  serviceId: string | null | undefined,
): void {
  if (!canAccessEnrolment(session, serviceId)) throw ApiError.forbidden();
}
