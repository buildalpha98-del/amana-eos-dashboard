/**
 * GET /api/cron/owna-handover-nudge — daily. Families whose OWNA invitation
 * went 3+ days ago and haven't got in get a friendly "did it arrive?" email,
 * and their centre an alert (src/lib/owna-handover.ts). Once per invitation.
 * Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { runOwnaNudges } from "@/lib/owna-handover";

export const maxDuration = 120;

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;
  const guard = await acquireCronLock("owna-handover-nudge", "daily");
  if (!guard.acquired) return NextResponse.json({ message: guard.reason, skipped: true });
  try {
    const summary = await runOwnaNudges();
    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
}, { timeoutMs: 110_000 });
