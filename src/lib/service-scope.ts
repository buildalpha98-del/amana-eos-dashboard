import type { Session } from "next-auth";
import { isEosRole } from "@/lib/role-enum";

/**
 * Returns the serviceId to scope queries by, or null if the user has full access.
 *
 * Post-4b widening: every non-admin role (marketing / member / staff) with
 * a populated session.user.serviceId is scoped to that service. Owner /
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
    !isEosRole(role) && // EOS roles are organisation-wide, never centre-scoped
    session.user.serviceId
  ) {
    return session.user.serviceId as string;
  }
  return null;
}

/**
 * State-based scoping. Always null since 2026-08-04 — admins see every
 * centre, everywhere.
 *
 * WHY THE FUNCTION SURVIVES: ~25 routes call it and AND its result into
 * their `where`. Returning null makes every one of them a no-op, which
 * is a far safer change than editing 25 query builders — and if
 * state scoping ever comes back it comes back in one place.
 *
 * WHAT WAS WRONG: admins were deliberately excluded from centre-
 * membership scoping (see centre-scope.ts) on the assumption that state
 * would scope them instead. So an admin assigned to every centre still
 * saw only their own state's, and the centre-access screen showed
 * assignments that did nothing. Two scoping systems, one silently
 * overriding the other.
 *
 * `User.state` still exists and is still worth recording — it just no
 * longer restricts what anyone can see.
 *
 * 2026-09-15: `User.state` DOES feed one scope again — a State Manager's
 * centre list in `getCentreScope` (centre-scope.ts). That one is a UNION
 * with their explicit memberships, never a replacement, which is the
 * distinction that made the version above unsafe.
 */
export function getStateScope(_session: Session | null): string | null {
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

/**
 * Every spelling of an Australian state to match a free-form state string
 * against.
 *
 * Both `User.state` and `Service.state` are nullable free-form columns, so
 * real rows carry a mix of "VIC", "vic" and "Victoria". Callers pair this
 * with Prisma's `{ in: [...], mode: "insensitive" }`, so case never matters
 * here — this only has to bridge the abbreviation-vs-full-name split.
 *
 * A blank value returns `[]`, and an unrecognised one returns just itself.
 * Neither ever widens a scope: callers treat `[]` as "no state-derived
 * rows", not "match everything".
 */
export function stateMatchValues(state: string | null | undefined): string[] {
  const trimmed = state?.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const match = AUSTRALIAN_STATES.find(
    (s) => s.value.toLowerCase() === lower || s.label.toLowerCase() === lower,
  );
  return match ? [match.value, match.label] : [trimmed];
}
