/**
 * GET /api/cron/enrolment-reply-clock — hourly. Keeps the thank-you page's
 * "we'll be in touch within 24 hours" (src/lib/enrolment-reply-clock.ts).
 * Deliberately NOT behind serviceAlertsPaused: it's about families waiting
 * on us, not the paused centre-operations stream. Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { runEnrolmentReplyClock } from "@/lib/enrolment-reply-clock";

export const maxDuration = 120;

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;
  const guard = await acquireCronLock("enrolment-reply-clock", "hourly");
  if (!guard.acquired) return NextResponse.json({ message: guard.reason, skipped: true });
  try {
    const summary = await runEnrolmentReplyClock();
    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
}, { timeoutMs: 110_000 });
