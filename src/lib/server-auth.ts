import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { hasFeature, hasMinRole, type Feature } from "@/lib/role-permissions";

// ---------------------------------------------------------------------------
// 1. Original requireAuth (kept for backward-compat)
// ---------------------------------------------------------------------------

export async function requireAuth(allowedRoles?: Role[]) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return {
      session: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { session, error: null };
}

// ---------------------------------------------------------------------------
// 2. New withApiAuth — higher-order handler wrapper
// ---------------------------------------------------------------------------

/**
 * Options for the withApiAuth wrapper.
 *
 * Provide at most ONE of:
 * - `roles`       — explicit allow-list of roles
 * - `minRole`     — minimum role level (owner > admin > member > staff)
 * - `feature`     — feature-based capability check
 *
 * If none are provided, only authentication (valid session) is enforced.
 */
interface ApiAuthOptions {
  /** Explicit allow-list of roles */
  roles?: Role[];
  /** Minimum role level required */
  minRole?: Role;
  /** Feature-level permission required */
  feature?: Feature;
}

/**
 * Authenticated API handler signature.
 * The `session` is guaranteed to be valid (non-null user with role).
 */
type AuthenticatedHandler = (
  req: NextRequest,
  session: Session,
  context?: { params?: Record<string, string> },
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a Next.js API route handler with authentication and authorisation.
 *
 * @example
 * ```ts
 * // Only owners can access
 * export const POST = withApiAuth(
 *   async (req, session) => {
 *     // session.user is guaranteed here
 *     return NextResponse.json({ ok: true });
 *   },
 *   { roles: ["owner"] }
 * );
 *
 * // Any authenticated user
 * export const GET = withApiAuth(async (req, session) => {
 *   return NextResponse.json({ data: [] });
 * });
 *
 * // Feature-based check
 * export const PATCH = withApiAuth(
 *   async (req, session) => { ... },
 *   { feature: "timesheets.approve" }
 * );
 *
 * // Minimum role level
 * export const DELETE = withApiAuth(
 *   async (req, session) => { ... },
 *   { minRole: "admin" }
 * );
 * ```
 */
export function withApiAuth(
  handler: AuthenticatedHandler,
  options?: ApiAuthOptions,
) {
  return async (
    req: NextRequest,
    context?: { params?: Record<string, string> },
  ): Promise<NextResponse> => {
    // --- Authentication ---
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role as Role;

    // --- Authorisation: explicit role list ---
    if (options?.roles && !options.roles.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Authorisation: minimum role level ---
    if (options?.minRole && !hasMinRole(role, options.minRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Authorisation: feature check ---
    if (options?.feature && !hasFeature(role, options.feature)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- All checks passed → run the handler ---
    try {
      return await handler(req, session, context);
    } catch (err) {
      console.error(`API error [${req.method} ${req.nextUrl.pathname}]:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Internal server error" },
        { status: 500 },
      );
    }
  };
}
