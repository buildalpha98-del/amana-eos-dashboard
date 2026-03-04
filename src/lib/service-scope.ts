import type { Session } from "next-auth";

/**
 * Returns the serviceId to scope queries by, or null if the user has full access.
 * Staff users are scoped to their assigned service/centre.
 */
export function getServiceScope(session: Session | null): string | null {
  if (!session?.user) return null;
  if (session.user.role === "staff" && session.user.serviceId) {
    return session.user.serviceId as string;
  }
  return null;
}
