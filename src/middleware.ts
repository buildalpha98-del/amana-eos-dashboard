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
    "/my-portal",
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
    "/timesheets",
    "/leave",
    "/contracts",
    "/team",
    "/settings",
    "/crm",
    "/crm/templates",
    "/queue",
  ],
  admin: [
    "/dashboard",
    "/my-portal",
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
    "/timesheets",
    "/leave",
    "/contracts",
    "/team",
    "/crm",
    "/queue",
    // No /settings or /crm/templates
  ],
  member: [
    "/dashboard",
    "/my-portal",
    "/rocks",
    "/todos",
    "/issues",
    "/meetings",
    "/services",
    "/communication",
    "/compliance",
    "/documents",
    "/onboarding",
    "/leave",
    "/queue",
  ],
  marketing: [
    "/dashboard",
    "/my-portal",
    "/marketing",
    "/communication",
    "/documents",
    "/crm",
    "/services",
    "/todos",
    "/queue",
  ],
  head_office: [
    "/dashboard",
    "/my-portal",
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
    "/timesheets",
    "/leave",
    "/contracts",
    "/team",
    "/crm",
    "/queue",
  ],
  coordinator: [
    "/dashboard",
    "/my-portal",
    "/services",
    "/todos",
    "/issues",
    "/scorecard",
    "/meetings",
    "/communication",
    "/compliance",
    "/documents",
    "/onboarding",
    "/leave",
    "/queue",
    "/marketing",
  ],
  staff: [
    "/dashboard",
    "/my-portal",
    "/documents",
    "/communication",
    "/onboarding",
    "/todos",
    "/compliance",
    "/leave",
    "/queue",
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
    "/my-portal/:path*",
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
    "/timesheets/:path*",
    "/leave/:path*",
    "/contracts/:path*",
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
    "/api/accountability-chart/:path*",
    "/api/todo-templates/:path*",
    "/api/dashboard/:path*",
    "/api/leave/:path*",
    "/api/timesheets/:path*",
    "/api/timesheet-entries/:path*",
    "/api/contracts/:path*",
    "/api/policies/:path*",
    "/api/offboarding/:path*",
    "/api/my-portal/:path*",
    "/api/emergency-contacts/:path*",
    "/api/qualifications/:path*",
    // ── Previously missing API routes (P0 security fix) ──
    "/api/documents/:path*",
    "/api/projects/:path*",
    "/api/project-templates/:path*",
    "/api/search/:path*",
    "/api/upload/:path*",
    "/api/email/:path*",
    "/api/activity-log/:path*",
    "/api/goals/:path*",
    "/api/vto/:path*",
    "/api/meetings/:path*",
    "/api/measurables/:path*",
    "/api/lms/:path*",
    "/api/onboarding/:path*",
    "/crm/:path*",
    "/api/crm/:path*",
    "/queue/:path*",
    "/api/queue/:path*",
  ],
};
