/**
 * GET /api/cron/staff-updates-roundup — the Monday staff email round-up
 * (src/lib/staff-updates.ts). Every approved, not-urgent staff email goes
 * out in one email per person. Sunday 20:00 UTC = Monday 7am Sydney in
 * summer (6am in winter). Bearer CRON_SECRET; weekly lock.
 */
import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { sendWeeklyRoundup } from "@/lib/staff-updates";

export const maxDuration = 300;

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;
  const guard = await acquireCronLock("staff-updates-roundup", "weekly");
  if (!guard.acquired) return NextResponse.json({ message: guard.reason, skipped: true });
  try {
    const summary = await sendWeeklyRoundup();
    logger.info("Staff round-up sent", summary);
    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Staff round-up failed", { error: msg });
    await guard.fail(new Error(msg));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}, { timeoutMs: 290_000 });
