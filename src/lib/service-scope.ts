import type { Session } from "next-auth";

/**
 * Returns the serviceId to scope queries by, or null if the user has full access.
 * Staff and member users are scoped to their assigned service/centre.
 */
export function getServiceScope(session: Session | null): string | null {
  if (!session?.user) return null;
  const role = session.user.role as string;
  if ((role === "staff" || role === "member") && session.user.serviceId) {
    return session.user.serviceId as string;
  }
  return null;
}
