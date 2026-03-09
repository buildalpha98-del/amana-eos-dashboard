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

/**
 * Returns the Australian state to filter services by for State Manager (admin) users.
 * Returns null for owner / head_office / member / staff (they use different scoping).
 */
export function getStateScope(session: Session | null): string | null {
  if (!session?.user) return null;
  const role = session.user.role as string;
  if (role === "admin" && session.user.state) {
    return session.user.state as string;
  }
  return null;
}

/** Australian state options for dropdowns */
export const AUSTRALIAN_STATES = [
  { value: "VIC", label: "Victoria" },
  { value: "NSW", label: "New South Wales" },
  { value: "QLD", label: "Queensland" },
  { value: "SA", label: "South Australia" },
  { value: "WA", label: "Western Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "NT", label: "Northern Territory" },
  { value: "ACT", label: "Australian Capital Territory" },
] as const;
