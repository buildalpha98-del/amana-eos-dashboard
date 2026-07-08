import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { canAccessPage, parseRole } from "@/lib/role-permissions";
import { isInductionLocked, isInductionAllowedPath } from "@/lib/induction-lock";

// Public API routes that bypass auth middleware (they handle their own auth or are intentionally public)
const PUBLIC_API_ROUTES = [
  "/api/services/public-list",
  // Parents filling out the public enrolment form at /enrol/[token] have no session.
  // The route itself rate-limits by IP and validates magic bytes / size / extension.
  "/api/upload/enrolment-file",
];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    // Only enforce role checks on page routes (not API routes — those use requireAuth)
    if (pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    // Use the shared canAccessPage helper from role-permissions so dynamic
    // `[id]` route patterns (e.g. /children/[id]) match concrete paths
    // (/children/abc123) consistently with client-side sidebar filtering.
    //
    // 2026-06-02: token may carry a `rolePageOverride` — a custom
    // allowlist set by an owner via /settings/permissions. When present,
    // it replaces the compile-time default for THIS user's role. The
    // JWT callback refreshes it every 5 min so changes propagate without
    // a forced logout.
    // Induction locked-mode (per-user, driven by inductionStatus on the token —
    // NOT the per-role override system). A new starter, or a backfilled staffer
    // whose grace has expired, may only reach their training, profile, handbook
    // and policies. Runs before the role check so a locked user is funnelled to
    // /my-training regardless of what their role would otherwise permit.
    if (
      isInductionLocked(
        token?.inductionStatus as string | undefined,
        token?.inductionGraceUntil as string | null | undefined,
      )
    ) {
      if (!isInductionAllowedPath(pathname)) {
        const url = req.nextUrl.clone();
        url.pathname = "/my-training";
        return NextResponse.redirect(url);
      }
      // On an induction-allowed path — let it through WITHOUT the role-page
      // check below. The player (/learn) and other induction surfaces must be
      // reachable for a locked new starter regardless of their role's page list.
      return NextResponse.next();
    }

    const role = parseRole(token?.role);
    if (role) {
      const override = token?.rolePageOverride as readonly string[] | null | undefined;
      const overrides =
        override !== undefined ? { [role]: override } : undefined;
      if (!canAccessPage(role, pathname, overrides)) {
        // Redirect to dashboard if user doesn't have access
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow public API routes through without authentication
        if (PUBLIC_API_ROUTES.some((route) => req.nextUrl.pathname === route)) {
          return true;
        }
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/my-portal/:path*",
    "/my-day/:path*",
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
    "/feedback/:path*",
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
    "/policies/:path*",
    "/api/policies/:path*",
    "/api/offboarding/:path*",
    "/api/my-portal/:path*",
    "/api/emergency-contacts/:path*",
    "/api/qualifications/:path*",
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
    "/api/enrolments/:path*",
    "/api/waitlist/:path*",
    "/enrolments/:path*",
    "/api/children/:path*",
    "/children/:path*",
    "/incidents/:path*",
    "/api/incidents/:path*",
    "/api/sequences/:path*",
    "/getting-started/:path*",
    "/profile/:path*",
    "/conversions/:path*",
    "/recruitment/:path*",
    "/holiday-quest/:path*",
    "/tools/:path*",
    "/automations/:path*",
    "/audit-log/:path*",
    "/guides/:path*",
    "/help/:path*",
    "/handbook/:path*",
    "/workforce-reports/:path*",
    "/directory/:path*",
    "/enquiries/:path*",
    "/activity-library/:path*",
    "/scenarios/:path*",
    "/data-room/:path*",
    "/reports/:path*",
    "/assistant/:path*",
    "/my-training/:path*",
    "/learn/:path*",
    "/api/induction/:path*",
  ],
};
