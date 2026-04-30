import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { logger } from "@/lib/logger";

/**
 * Daily cron — deletes expired ShiftHandover rows.
 *
 * Idempotent: a missed day just piles up expired rows until the next run.
 * `acquireCronLock("handover-cleanup", "daily")` guards against double-run.
 */
export async function GET(req: Request) {
  const authError = verifyCronSecret(req);
  if (authError) return authError.error;

  const guard = await acquireCronLock("handover-cleanup", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ skipped: true, reason: guard.reason });
  }

  try {
    const { count } = await prisma.shiftHandover.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });

    await guard.complete({ deleted: count });
    return NextResponse.json({ ok: true, deleted: count });
  } catch (err) {
    await guard.fail(err);
    logger.error("handover-cleanup cron failed", { err });
    return NextResponse.json(
      { error: "handover-cleanup failed" },
      { status: 500 },
    );
  }
}
