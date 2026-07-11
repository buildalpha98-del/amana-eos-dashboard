/**
 * Edge-safe induction helpers.
 *
 * These are PURE (no Prisma, no Node APIs) so they can be imported by
 * `src/middleware.ts`, which runs in the Edge runtime. Anything touching the
 * database lives in `src/lib/induction.ts` (which re-exports these).
 */

/** Path prefixes a locked (new_starter / in_training-without-grace) user may reach. */
export const INDUCTION_ALLOWED_PREFIXES = [
  "/my-training",
  "/learn",
  "/profile",
  "/handbook",
  "/policies",
] as const;

/**
 * Is this user in locked (restricted-nav) mode? Locked users see only the
 * induction surfaces until they finish (or, for backfilled staff, until their
 * grace window expires). `now` is injectable so callers/tests stay deterministic.
 */
export function isInductionLocked(
  status: string | undefined | null,
  graceUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== "new_starter" && status !== "in_training") return false;
  if (graceUntil && new Date(graceUntil) > now) return false; // backfilled w/ active grace
  return true;
}

/** True when `pathname` is reachable while locked. */
export function isInductionAllowedPath(pathname: string): boolean {
  return INDUCTION_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}
