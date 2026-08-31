import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { applyDueFeeChanges } from "@/lib/fee-changes";

/**
 * GET /api/cron/fee-changes
 *
 * Daily — applies fee changes whose effective date has arrived.
 *
 * Runs early (before the centres open) so a rate that starts today is
 * the rate charged today. The query is `effectiveDate <= today` rather
 * than `= today`, so a day the cron doesn't run self-heals on the next
 * one instead of dropping that change forever.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("fee-changes", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  const result = await applyDueFeeChanges(prisma);

  if (result.applied > 0 || result.cancelled > 0) {
    logger.info("Fee changes applied", {
      applied: result.applied,
      cancelled: result.cancelled,
      services: result.services,
    });
  }

  return NextResponse.json(result);
});
