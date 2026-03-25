/**
 * Parent Portal authentication utilities.
 *
 * Parents authenticate via magic-link email → JWT stored in `parent-session` cookie.
 * This is completely separate from staff NextAuth sessions.
 */

import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { handleApiError } from "@/lib/api-handler";
import { logger, generateRequestId } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// JWT payload shape
// ---------------------------------------------------------------------------

export interface ParentJwtPayload {
  email: string;
  name: string;
  enrolmentIds: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSecret(): Uint8Array {
  const secret = process.env.PARENT_JWT_SECRET;
  if (!secret) {
    throw new Error("PARENT_JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// Sign / Verify
// ---------------------------------------------------------------------------

/**
 * Sign a JWT for a parent session. Expires in 7 days.
 */
export async function signParentJwt(payload: ParentJwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/**
 * Verify a parent JWT and return its payload, or null if invalid/expired.
 */
export async function verifyParentJwt(
  token: string,
): Promise<ParentJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const { email, name, enrolmentIds } = payload as unknown as ParentJwtPayload;
    if (!email || !name || !Array.isArray(enrolmentIds)) return null;
    return { email, name, enrolmentIds };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session extraction from request
// ---------------------------------------------------------------------------

/**
 * Read the `parent-session` cookie, verify the JWT, and return the payload.
 * Returns null if no cookie or invalid token.
 */
export async function getParentSession(
  req: NextRequest,
): Promise<ParentJwtPayload | null> {
  const token = req.cookies.get("parent-session")?.value;
  if (!token) return null;
  return verifyParentJwt(token);
}

// ---------------------------------------------------------------------------
// withParentAuth — route wrapper
// ---------------------------------------------------------------------------

type RouteContext = { params?: Promise<Record<string, string>> };

type ParentApiHandler = (
  req: NextRequest,
  context: RouteContext & { parent: ParentJwtPayload },
) => Promise<NextResponse> | NextResponse;

/** Default timeout for parent handlers (55s) */
const DEFAULT_TIMEOUT_MS = 55_000;

/**
 * Wraps a Next.js API route handler with parent JWT authentication.
 *
 * Similar to `withApiAuth` but uses the parent-session cookie instead of
 * NextAuth sessions. Returns 401 if no valid parent session.
 *
 * The handler receives `context.parent` with the verified JWT payload.
 *
 * @example
 * ```ts
 * export const GET = withParentAuth(async (req, { parent }) => {
 *   return NextResponse.json({ email: parent.email });
 * });
 * ```
 */
export function withParentAuth(
  handler: ParentApiHandler,
  options?: { timeoutMs?: number },
) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (req: NextRequest, routeContext?: RouteContext): Promise<NextResponse> => {
    const reqId = req.headers.get("x-request-id") || generateRequestId();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const parent = await getParentSession(req);
      if (!parent) {
        logger.warn("Parent auth: no valid session", {
          reqId,
          method: req.method,
          path: req.nextUrl.pathname,
        });
        throw ApiError.unauthorized("Invalid or expired parent session");
      }

      // Verify enrolmentIds still exist and belong to this parent
      const validEnrolments = await prisma.enrolmentSubmission.findMany({
        where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
        select: { id: true },
      });
      parent.enrolmentIds = validEnrolments.map(e => e.id);

      // Rate limit: 60 req/min per parent per endpoint
      const endpoint = new URL(req.url).pathname;
      const rl = await checkRateLimit(`parent:${parent.email}:${endpoint}`, 60, 60_000);
      if (rl.limited) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }

      const ctx = { ...routeContext, parent } as RouteContext & {
        parent: ParentJwtPayload;
      };

      const handlerPromise = handler(req, ctx);

      const result =
        timeoutMs > 0
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
