/**
 * withDbRetry — retry-once wrapper for Prisma operations that may
 * fail due to Neon Postgres scale-to-zero connection reaping.
 *
 * # The problem
 *
 * Neon's serverless Postgres scales connections to zero when idle.
 * Pooled connections sitting in our process between cron firings
 * get killed server-side; the next query on that stale handle
 * throws:
 *
 *     prisma:error Error in PostgreSQL connection: Error {
 *       kind: Db, cause: Some(DbError {
 *         severity: "FATAL",
 *         code: SqlState(E57P01),
 *         message: "terminating connection due to administrator command"
 *       })
 *     }
 *
 * (Also surfaces as "Connection terminated unexpectedly" or
 * "Closed" depending on which underlying driver hit it first.)
 *
 * The connection-pool side is fine; the issue is just the *first*
 * query on a stale handle. Disconnecting forces Prisma to reconnect.
 *
 * # The fix
 *
 * Wrap the cron handler body in `withDbRetry`. On the recognised
 * disconnect signatures, call `prisma.$disconnect()` to invalidate
 * the pool, then re-invoke the function exactly once. A second
 * failure with the same signature is a real problem — let it
 * propagate.
 *
 * # Usage
 *
 *   export const GET = withApiHandler(async (req) => {
 *     // ... auth ...
 *     return withDbRetry(async () => {
 *       // any number of prisma calls
 *       const things = await prisma.thing.findMany();
 *       return NextResponse.json({ things });
 *     });
 *   });
 *
 * # When NOT to use
 *
 * - Dashboard request handlers (request handlers are warm; Neon
 *   reaping only hits idle pooled connections). Keep this in
 *   crons + webhook receivers + scheduled tasks.
 * - Transactions where retrying half-way through is unsafe. Wrap
 *   the whole transaction once at the top, not individual queries
 *   inside.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Error signatures that indicate a stale/closed pooled connection.
 * Pattern-matched on the stringified error (Prisma surfaces these
 * differently depending on whether the underlying error came from
 * pg-native or the rust query engine).
 */
const STALE_CONNECTION_SIGNATURES = [
  // Postgres FATAL code for admin shutdown (Neon scale-to-zero).
  "57P01",
  // pg driver-level disconnect — happens when the TCP socket
  // closes mid-query.
  "Connection terminated unexpectedly",
  // Prisma's own surfacing of a closed pool entry.
  "Closed",
  // Neon-flavoured variant we've also seen in logs.
  "terminating connection due to administrator command",
];

function isStaleConnectionError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  return STALE_CONNECTION_SIGNATURES.some((sig) => msg.includes(sig));
}

/**
 * Run `fn`. If it throws a recognised stale-connection error, force
 * a Prisma reconnect and try ONCE more. A second failure with the
 * same signature is a real problem (not a stale handle) and is
 * re-thrown.
 *
 * Non-stale errors are re-thrown immediately without a retry.
 *
 * Returns the value `fn` returned on success.
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isStaleConnectionError(err)) throw err;

    logger.warn("prisma-retry: stale connection detected, retrying once", {
      error: err instanceof Error ? err.message : String(err),
    });

    // Force the pool to drop the dead handle. The next prisma call
    // inside fn() will lazily reconnect.
    try {
      await prisma.$disconnect();
    } catch (disconnectErr) {
      // Disconnect itself failing is unusual but not blocking — the
      // next call will still recreate the connection. Log and move on.
      logger.warn("prisma-retry: $disconnect failed", {
        error:
          disconnectErr instanceof Error
            ? disconnectErr.message
            : String(disconnectErr),
      });
    }

    // Second attempt — if it fails the same way, the issue isn't
    // stale-handle, it's something we shouldn't paper over.
    return await fn();
  }
}
