import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { logger, generateRequestId } from "@/lib/logger";

type RouteContext = { params?: Promise<Record<string, string>> };

type ApiHandler = (
  req: NextRequest,
  context?: RouteContext,
) => Promise<NextResponse> | NextResponse;

/** Default timeout for API handlers (55s — leaves 5s buffer for Vercel's 60s limit) */
const DEFAULT_TIMEOUT_MS = 55_000;

/**
 * Wraps a Next.js API route handler with standardised error handling and timeout.
 *
 * Use this for routes that do NOT need session auth (cowork, public, webhooks).
 * For authenticated dashboard routes, use `withApiAuth()` instead.
 *
 * Caught errors are formatted as `{ error: string, details?: unknown }`.
 * Throw `ApiError` for known error conditions.
 *
 * @param handler - The route handler function
 * @param options - Optional config: `timeoutMs` overrides the default 55s timeout
 *
 * @example
 * ```ts
 * export const POST = withApiHandler(async (req) => {
 *   const body = await req.json();
 *   if (!body.name) throw ApiError.badRequest("Name is required");
 *   return NextResponse.json({ ok: true });
 * });
 *
 * // Cron with longer timeout
 * export const GET = withApiHandler(async (req) => { ... }, { timeoutMs: 55_000 });
 * ```
 */
export function withApiHandler(
  handler: ApiHandler,
  options?: { timeoutMs?: number },
) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (req: NextRequest, context?: RouteContext): Promise<NextResponse> => {
    const reqId = req.headers.get("x-request-id") || generateRequestId();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const handlerPromise = handler(req, context);

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

/**
 * Shared error handler used by both `withApiHandler()` and `withApiAuth()`.
 * Includes reqId for log correlation when provided.
 */
export function handleApiError(req: NextRequest, err: unknown, reqId?: string): NextResponse {
  const logCtx = { reqId, method: req.method, path: req.nextUrl.pathname };

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      logger.error(`${req.method} ${req.nextUrl.pathname}`, {
        ...logCtx,
        status: err.status,
        err,
      });
    }
    return NextResponse.json(
      { error: err.message, ...(err.details != null ? { details: err.details } : {}) },
      { status: err.status },
    );
  }

  logger.error(`${req.method} ${req.nextUrl.pathname}`, { ...logCtx, err });
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
