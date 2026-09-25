import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { canAccessPage, parseRole } from "@/lib/role-permissions";
import { isInductionLocked, isInductionAllowedPath } from "@/lib/induction-lock";

// Public API routes that bypass auth middleware (they handle their own auth or are intentionally public)
const PUBLIC_API_ROUTES = [
  "/api/services/public-list",
  // /api/upload/enrolment-file was here for the anonymous enrolment form
  // at /enrol/[token]. That form is retired and the route now requires a
  // parent session, so it no longer needs — or should have — a bypass.
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
        { role: token?.role as string | undefined },
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
    /**
     * PAGES — everything except the public surface.
     *
     * 2026-09-25: this used to be a hand-maintained list of ~54 page prefixes,
     * and it had drifted. `/waitlist`, `/roster`, `/leadership`, `/billing`,
     * `/notifications`, `/knowledge`, `/bookings`, `/families` and ~20 more
     * dashboard routes were absent, and since `(dashboard)/layout.tsx` is a
     * client component with no server session guard, those pages ran with NO
     * auth requirement and NO `canAccessPage` role check. `/leadership` is
     * admin-only in the nav and anyone could open it. (The backing APIs are
     * gated, so this was an authorization gap rather than a data leak — but
     * every new page added under an unlisted prefix inherited the hole.)
     *
     * Inverted to a deny-list so new pages are protected by default. Each
     * exclusion is anchored to a segment boundary with `(?:/|$)` — a bare
     * prefix would also swallow real pages, e.g. `enrol` matching
     * `/enrolments` and `survey` matching `/surveys`. The `.*\..*` arm drops
     * anything with a file extension (static assets, favicon.ico). The
     * trailing `.+` leaves `/` itself alone, where `app/page.tsx` already does
     * its own session-aware redirect.
     *
     * Public by design: the auth pages, the family portal, the public help
     * centre, careers, privacy, the anonymous safe-report form, token landing
     * pages (ramp/onboarding check-ins, surveys, enrolment), the enquiry form,
     * the kiosk (bearer-token device auth) and `/a/[code]` QR redirects.
     */
    "/((?!(?:api|_next|a|login|forgot-password|reset-password|parent|support|careers|privacy|safe-report|ramp-checkin|onboarding-checkin|enquire|enrol|kiosk|survey)(?:/|$)|notifications/preferences(?:/|$)|.*\\..*).+)",

    /**
     * API — unchanged. The middleware body early-returns for `/api/`, so these
     * only enforce the `authorized` callback (a session must exist). Route
     * handlers still do their own role checks via `withApiAuth`.
     */
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
    "/api/crm/:path*",
    "/api/queue/:path*",
    "/api/enrolments/:path*",
    "/api/waitlist/:path*",
    "/api/children/:path*",
    "/api/incidents/:path*",
    "/api/sequences/:path*",
    "/api/induction/:path*",
    "/api/help-centre/:path*",
  ],
};
