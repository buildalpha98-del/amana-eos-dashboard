/**
 * Edge-safe induction helpers.
 *
 * These are PURE (no Prisma, no Node APIs) so they can be imported by
 * `src/middleware.ts`, which runs in the Edge runtime. Anything touching the
 * database lives in `src/lib/induction.ts` (which re-exports these).
 */

/**
 * Path prefixes a locked (new_starter / in_training-without-grace) user may
 * reach.
 *
 * `/compliance` is here because the WWCC blocker is otherwise unsatisfiable:
 * the staff cert uploader lives on that page, and a locked user was redirected
 * away from it before they could upload the very document the gate demands.
 * The compliance API scopes `staff` to their own certs server-side, so a locked
 * user reaching it leaks nothing.
 *
 * `/onboarding` is deliberately NOT here. It is the admin induction surface
 * (practical sign-off, overrides), and middleware skips the role check for
 * allowed paths — listing it would hand every locked educator the sign-off
 * queue. Admin-tier roles reach it via INDUCTION_EXEMPT_ROLES instead.
 */
export const INDUCTION_ALLOWED_PREFIXES = [
  "/my-training",
  "/learn",
  "/profile",
  "/handbook",
  "/policies",
  "/compliance",
] as const;

/**
 * Roles that administer the induction gate, and so can never be locked out by
 * it.
 *
 * 2026-08-25: the backfill grace window expired and locked 77 of 82 active
 * staff simultaneously — all four owners and the admin among them. Since the
 * unlock tools live on `/onboarding` (not an induction surface) and the lock
 * ran ahead of the role check, there was no one left who could reach the fix.
 * A gate that can lock out its own administrators is a deadlock, not a gate.
 */
const GATE_ADMIN_ROLES = ["owner", "head_office", "admin"] as const;

/**
 * Roles with no child-facing duties. The essential curriculum is entirely
 * about working on the floor — child safety, mandatory reporting, active
 * supervision, first day in a service — so it does not apply to them, and
 * they are excluded from induction and monthly auto-enrolment alike.
 */
const NON_CHILD_FACING_ROLES = ["marketing"] as const;

/**
 * Roles the induction gate does not apply to. Consumed by locked-mode, the
 * backfill, and the monthly training cron so a single list governs all three
 * — an exempt role enrolled by a cron would simply be re-locked next sweep.
 */
export const INDUCTION_EXEMPT_ROLES = [
  ...GATE_ADMIN_ROLES,
  ...NON_CHILD_FACING_ROLES,
] as const;

/** True when `role` is outside the induction gate's scope. */
export function isInductionExemptRole(role: string | undefined | null): boolean {
  return (INDUCTION_EXEMPT_ROLES as readonly string[]).includes(role ?? "");
}

/**
 * Is this user in locked (restricted-nav) mode? Locked users see only the
 * induction surfaces until they finish (or, for backfilled staff, until their
 * grace window expires).
 *
 * `role` and `now` are passed as an options object rather than positionally:
 * an earlier signature took `now` third, and a bare positional `role` would
 * have let a stray `Date` silently read as a role. `now` is injectable so
 * callers and tests stay deterministic.
 */
export function isInductionLocked(
  status: string | undefined | null,
  graceUntil: Date | string | null | undefined,
  opts: { role?: string | null; now?: Date } = {},
): boolean {
  const { role, now = new Date() } = opts;
  if (isInductionExemptRole(role)) return false; // administers the gate
  if (status !== "new_starter" && status !== "in_training") return false;
  if (graceUntil && new Date(graceUntil) > now) return false; // backfilled w/ active grace
  return true;
}

/** True when `pathname` is reachable while locked. */
export function isInductionAllowedPath(pathname: string): boolean {
  return INDUCTION_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}
