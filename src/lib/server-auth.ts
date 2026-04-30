import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { hasFeature, hasMinRole, type Feature } from "@/lib/role-permissions";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-handler";
import { ApiError } from "@/lib/api-error";
import { logger, generateRequestId } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

/** Default timeout for authenticated handlers (55s — leaves 5s buffer for Vercel's 60s limit) */
const DEFAULT_TIMEOUT_MS = 55_000;

// ---------------------------------------------------------------------------
// User-active cache (avoids DB hit on every request)
// ---------------------------------------------------------------------------
const userActiveCache = new Map<string, { active: boolean; expiresAt: number }>();
const USER_ACTIVE_TTL = 60_000; // 60 seconds

/** @internal Clear the user-active cache (for tests) */
export function _clearUserActiveCache() {
  userActiveCache.clear();
}

const USER_ACTIVE_CACHE_MAX = 200;

async function isUserActive(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = userActiveCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.active;

  // Evict expired entries before inserting (prevents unbounded growth)
  if (userActiveCache.size >= USER_ACTIVE_CACHE_MAX) {
    for (const [key, entry] of userActiveCache) {
      if (entry.expiresAt <= now) userActiveCache.delete(key);
    }
    // If still at cap after purging expired, drop the oldest half
    if (userActiveCache.size >= USER_ACTIVE_CACHE_MAX) {
      let toDelete = Math.floor(userActiveCache.size / 2);
      for (const key of userActiveCache.keys()) {
        if (toDelete <= 0) break;
        userActiveCache.delete(key);
        toDelete--;
      }
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true },
  });

  const active = dbUser?.active ?? false;
  userActiveCache.set(userId, { active, expiresAt: now + USER_ACTIVE_TTL });

  return active;
}

// ---------------------------------------------------------------------------
// withApiAuth — higher-order handler wrapper
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
  /** Rate limit: max requests per window. Default 60 req/min per user. Set false to disable. */
  rateLimit?: { max: number; windowMs: number } | false;
  /** Timeout in ms. Default 55s. Set 0 to disable. */
  timeoutMs?: number;
}

/**
 * Authenticated API handler signature.
 * The `session` is guaranteed to be valid (non-null user with role).
 */
type AuthenticatedHandler = (
  req: NextRequest,
  session: Session,
  context?: { params?: Promise<Record<string, string>> },
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
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    // --- Authentication ---
    const session = await getServerSession(authOptions);

    const endpoint = req.nextUrl.pathname;

    if (!session?.user?.id) {
      logger.warn("Auth: no session", { endpoint, method: req.method });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --- Verify user is still active (cached 60s) ---
    const active = await isUserActive(session.user.id);
    if (!active) {
      logger.warn("Auth: deactivated user", { userId: session.user.id, endpoint });
      return NextResponse.json(
        { error: "Account deactivated" },
        { status: 401 },
      );
    }

    const VALID_ROLES: Role[] = ["owner", "head_office", "admin", "marketing", "member", "staff"];
    const role = session.user.role as string;
    if (!VALID_ROLES.includes(role as Role)) {
      logger.error("Invalid role in session", { userId: session.user.id, role });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const validatedRole = role as Role;

    // --- Authorisation: explicit role list ---
    if (options?.roles && !options.roles.includes(validatedRole)) {
      logger.warn("Auth: role denied", { userId: session.user.id, role: validatedRole, required: options.roles, endpoint });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Authorisation: minimum role level ---
    if (options?.minRole && !hasMinRole(validatedRole, options.minRole)) {
      logger.warn("Auth: below minRole", { userId: session.user.id, role: validatedRole, minRole: options.minRole, endpoint });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Authorisation: feature check ---
    if (options?.feature && !hasFeature(validatedRole, options.feature)) {
      logger.warn("Auth: feature denied", { userId: session.user.id, role: validatedRole, feature: options.feature, endpoint });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Rate limiting (per user+endpoint, 60 req/min default) ---
    if (options?.rateLimit !== false) {
      const rlConfig = options?.rateLimit ?? { max: 60, windowMs: 60_000 };
      const rl = await checkRateLimit(
        `auth:${session.user.id}:${endpoint}`,
        rlConfig.max,
        rlConfig.windowMs,
      );
      if (rl.limited) {
        logger.warn("Auth: rate limited", { userId: session.user.id, endpoint, resetIn: rl.resetIn });
        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } },
        );
      }
    }

    // --- All checks passed → run the handler ---
    const reqId = req.headers.get("x-request-id") || generateRequestId();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const handlerPromise = handler(req, session, context);

      const result = timeoutMs > 0
        ? await Promise.race([
            handlerPromise,
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(
                () => reject(new ApiError(504, "Request timed out")),
                timeoutMs,
              );
            }),
          ])
        : await handlerPromise;

      result.headers.set("x-request-id", reqId);
      return result;
    } catch (err) {
      const res = handleApiError(req, err, reqId);
      res.headers.set("x-request-id", reqId);
      return res;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };
}
