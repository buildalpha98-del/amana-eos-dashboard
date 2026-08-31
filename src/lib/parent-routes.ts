/**
 * Routes under /parent that a signed-OUT visitor must be able to reach.
 *
 * 2026-07-30: this exists because the check was duplicated. ParentShell and
 * ParentAuthProvider each hardcoded `pathname !== "/parent/login"`, so
 * adding /parent/signup and /parent/confirm meant updating two places —
 * and missing one silently redirected parents away from the very page they
 * needed. Fixing one gate and not the other looked exactly like the bug
 * being unfixed.
 *
 * ONE definition. Both gates import this.
 */
export const PUBLIC_PARENT_ROUTES = [
  "/parent/login",
  "/parent/signup",
  "/parent/confirm",
] as const;

export function isPublicParentRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (PUBLIC_PARENT_ROUTES as readonly string[]).includes(pathname);
}
