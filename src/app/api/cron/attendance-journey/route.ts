/**
 * GET /api/cron/attendance-journey — daily. Attendance-based family emails
 * (src/lib/attendance-journey.ts): "Is anything stopping you?" for families
 * approved 14+ days who haven't attended, the week-3 extra-day email, and
 * "We've missed Yusuf" for regulars gone 14+ days in term (missed-sessions.ts).
 * Only at centres whose OWNA sync is live. Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { runExtraDayOffers, runNoShowChecks } from "@/lib/attendance-journey";
import { runMissedSessionChecks } from "@/lib/missed-sessions";

export const maxDuration = 120;

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;
  const guard = await acquireCronLock("attendance-journey", "daily");
  if (!guard.acquired) return NextResponse.json({ message: guard.reason, skipped: true });
  try {
    const noShow = await runNoShowChecks();
    const extraDay = await runExtraDayOffers();
    const missed = await runMissedSessionChecks();
    const summary = { noShowSent: noShow.sent, extraDaySent: extraDay.sent, missedSent: missed.sent };
    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
}, { timeoutMs: 110_000 });
