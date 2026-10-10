import { getLandingPage } from "@/lib/role-permissions";

/**
 * Pick the post-sign-in destination. Service-scoped roles (staff / member /
 * coordinator) with an assigned `serviceId` land directly on their service's
 * detail page — tablets at the centre kiosk shouldn't go via /dashboard.
 * EOS-only roles land on /rocks (their primary surface). Other org-wide
 * roles land on /dashboard.
 *
 * Honours an explicit `callbackUrl` in the URL query — forgot-password
 * redirects + bookmarked links should still work.
 */
export function destinationForSession(
  session: {
    user?: { role?: string; serviceId?: string | null };
  } | null,
  callbackUrl: string,
): string {
  // Explicit callback wins, unless it's the generic /dashboard default.
  if (callbackUrl && callbackUrl !== "/dashboard") return callbackUrl;

  const role = session?.user?.role;
  const serviceId = session?.user?.serviceId;
  // Directors of Service land on their centre. Educators (staff) land on
  // My Portal via getLandingPage — 2026-10-07: a new starter dropped onto
  // the centre's Today tab had no idea what was being asked of them.
  const serviceScoped = role === "member" && !!serviceId;

  if (serviceScoped) return `/services/${serviceId}?tab=today`;
  // EOS roles → /rocks; everyone else → /dashboard.
  return getLandingPage(role);
}

