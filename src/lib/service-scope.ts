import type { Session } from "next-auth";

/**
 * Returns the serviceId to scope queries by, or null if the user has full access.
 *
 * Post-4b widening: every non-admin role (coordinator / marketing / member / staff)
 * with a populated session.user.serviceId is scoped to that service. Owner /
 * head_office / admin retain cross-service access (admin uses getStateScope
 * separately for state-level filtering).
 *
 * See docs/superpowers/plans/2026-04-22-services-daily-ops-4b-scope-audit.md
 * for the 17-route audit that drove this widening, including the rocks route
 * which keeps an inline override for EOS-wide visibility.
 */
export function getServiceScope(session: Session | null): string | null {
  if (!session?.user) return null;
  const role = session.user.role as string;
  if (
    role !== "owner" &&
    role !== "head_office" &&
    role !== "admin" &&
    session.user.serviceId
  ) {
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
