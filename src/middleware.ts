import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

/**
 * Role-based page access map.
 * Duplicated from role-permissions.ts because middleware runs on the Edge
 * runtime and cannot import from Node-only modules (Prisma types are
 * fine because they are pure TS, but the file itself may pull in
 * non-edge-compatible deps). Keeping a thin copy here is intentional.
 */
const rolePageAccess: Record<string, string[]> = {
  owner: [
    "/dashboard",
    "/vision",
    "/rocks",
    "/todos",
    "/issues",
    "/scorecard",
    "/meetings",
    "/financials",
    "/performance",
    "/services",
    "/projects",
    "/tickets",
    "/marketing",
    "/communication",
    "/compliance",
    "/documents",
    "/onboarding",
    "/team",
    "/settings",
  ],
  admin: [
    "/dashboard",
    "/vision",
    "/rocks",
    "/todos",
    "/issues",
    "/scorecard",
    "/meetings",
    "/financials",
    "/performance",
    "/services",
    "/projects",
    "/tickets",
    "/marketing",
    "/communication",
    "/compliance",
    "/documents",
    "/onboarding",
    "/team",
    // No /settings
  ],
  member: [
    "/dashboard",
    "/rocks",
    "/todos",
    "/issues",
    "/meetings",
    "/services",
    "/communication",
    "/compliance",
    "/documents",
    "/onboarding",
    // No /vision, /scorecard, /projects, /financials, /performance, /team, /settings, /tickets, /marketing
  ],
  staff: [
    "/dashboard",
    "/documents",
    "/communication",
    "/onboarding",
    "/todos",
    "/compliance",
  ],
};

function canAccess(role: string, pathname: string): boolean {
  const allowed = rolePageAccess[role];
  if (!allowed) return false;
  return allowed.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    // Only enforce role checks on page routes (not API routes — those use requireAuth)
    if (pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    const role = token?.role as string | undefined;
    if (role && !canAccess(role, pathname)) {
      // Redirect to dashboard if user doesn't have access
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/vision/:path*",
    "/rocks/:path*",
    "/todos/:path*",
    "/issues/:path*",
    "/scorecard/:path*",
    "/meetings/:path*",
    "/financials/:path*",
    "/performance/:path*",
    "/team/:path*",
    "/settings/:path*",
    "/tickets/:path*",
    "/marketing/:path*",
    "/communication/:path*",
    "/services/:path*",
    "/projects/:path*",
    "/documents/:path*",
    "/compliance/:path*",
    "/onboarding/:path*",
    "/api/rocks/:path*",
    "/api/todos/:path*",
    "/api/issues/:path*",
    "/api/scorecard/:path*",
    "/api/users/:path*",
    "/api/marketing/:path*",
    "/api/communication/:path*",
    "/api/services/:path*",
    "/api/xero/:path*",
    "/api/health-scores/:path*",
    "/api/financials/:path*",
    "/api/performance/:path*",
    "/api/team/:path*",
    "/api/tickets/:path*",
    "/api/org-settings/:path*",
    "/api/attendance/:path*",
    "/api/compliance/:path*",
    "/api/notifications/:path*",
  ],
};
