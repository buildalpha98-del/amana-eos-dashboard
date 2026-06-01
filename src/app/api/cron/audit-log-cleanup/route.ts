/**
 * GET /api/cron/audit-log-cleanup
 *
 * Monthly cron — 1st of the month at 03:00 UTC. Deletes audit log
 * rows older than 7 years. Two retention rules:
 *
 *   1. Fair Work Act record-keeping: employee records (including
 *      activity log) must be retained for 7 years.
 *   2. Australian Privacy Principle 11.2: organisations must take
 *      reasonable steps to destroy personal information no longer
 *      needed for any purpose for which it may be used or disclosed.
 *
 * Holding logs longer than necessary creates risk (each row is a
 * potential disclosure surface). Holding logs shorter than 7 years
 * creates risk (Fair Work non-compliance). Auto-pruning at exactly
 * 7 years splits the difference.
 *
 * Tables in scope:
 *   - `ActivityLog` — general entity events (cert create, contract
 *     issue, performance case update, separation finalise, etc.)
 *   - `SecurityAuditLog` — sensitive operations (login, password
 *     reset, role change, API key usage)
 *
 * Auth: Bearer CRON_SECRET. Idempotency: monthly cron-guard. If the
 * cleanup has already run this month, returns 200 + skipped.
 *
 * Batching: deleteMany is fine at our current volume (well under
 * 1M rows). If volume grows, switch to batched delete with a LIMIT
 * to avoid long table locks.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const RETENTION_YEARS = 7;
const MS_PER_YEAR = 365.25 * 86400000;

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("audit-log-cleanup", "monthly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  const cutoff = new Date(Date.now() - RETENTION_YEARS * MS_PER_YEAR);

  try {
    // Count first so we can report what would be deleted, then delete.
    // Cheap because of the createdAt indexes on both tables.
    const [activityLogToDelete, securityLogToDelete] = await Promise.all([
      prisma.activityLog.count({ where: { createdAt: { lt: cutoff } } }),
      prisma.securityAuditLog.count({ where: { createdAt: { lt: cutoff } } }),
    ]);

    let activityLogDeleted = 0;
    let securityLogDeleted = 0;

    if (activityLogToDelete > 0) {
      const res = await prisma.activityLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      activityLogDeleted = res.count;
    }
    if (securityLogToDelete > 0) {
      const res = await prisma.securityAuditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      securityLogDeleted = res.count;
    }

    const summary = {
      cutoff: cutoff.toISOString(),
      retentionYears: RETENTION_YEARS,
      activityLogDeleted,
      securityLogDeleted,
    };

    logger.info("Audit log cleanup complete", summary);

    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    await guard.fail(err instanceof Error ? err : new Error(String(err)));
    logger.error("Audit log cleanup failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
