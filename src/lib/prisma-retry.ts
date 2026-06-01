import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * One-shot retry wrapper for Prisma operations that may hit a stale pooled
 * connection between serverless cron invocations.
 *
 * Why this exists: Neon's scale-to-zero pooler reaps long-idle connections.
 * When the next cron run reaches for a stale handle from Prisma's pool, the
 * underlying socket has already been torn down by the server with Postgres
 * `57P01` (admin_shutdown) — Prisma surfaces this synchronously on the first
 * query, even though the next attempt against a fresh pool would succeed.
 *
 * The retry runs the operation at most twice. A second failure is escalated
 * — anything that fails this way back-to-back is not the idle-reap pattern
 * and should surface as a real error.
 */
function isStaleConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message =
    typeof (err as { message?: unknown }).message === "string"
      ? ((err as { message: string }).message)
      : "";
  if (
    message.includes("57P01") ||
    message.includes("administrator command") ||
    message.includes("Connection terminated unexpectedly") ||
    message.includes("Server has closed the connection") ||
    /\bClosed\b/.test(message)
  ) {
    return true;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (cause && cause !== err) return isStaleConnectionError(cause);
  return false;
}

export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isStaleConnectionError(err)) throw err;

    logger.warn("[prisma-retry] stale connection detected, retrying once", {
      message: (err as { message?: string })?.message,
    });

    try {
      await prisma.$disconnect();
    } catch {
      // $disconnect failures are not actionable — the next call will rebuild the pool anyway
    }

    return await fn();
  }
}

/**
 * Cron-route variant of `withApiHandler` that additionally wraps the handler
 * body in `withDbRetry`. This is the standard entry point for every route
 * under `src/app/api/cron/**` so the first Prisma call of each invocation is
 * resilient to Neon's idle-connection reaping (Postgres 57P01).
 *
 * Drop-in replacement for `withApiHandler` — identical signature.
 */
type CronRouteContext = { params?: Promise<Record<string, string>> };
type CronHandler = (
  req: NextRequest,
  context?: CronRouteContext,
) => Promise<NextResponse> | NextResponse;

export function withCronHandler(
  handler: CronHandler,
  options?: { timeoutMs?: number },
) {
  return withApiHandler(
    async (req, ctx) => withDbRetry(async () => handler(req, ctx)),
    options,
  );
}
