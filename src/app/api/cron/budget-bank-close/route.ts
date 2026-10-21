/**
 * GET /api/cron/budget-bank-close — monthly (2nd, ~3am Sydney): bank last
 * month's unspent purchase + grocery budget for every centre
 * (src/lib/budget-bank.ts). Idempotent. Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { runBankMonthClose } from "@/lib/budget-bank";

export const maxDuration = 120;

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;
  const guard = await acquireCronLock("budget-bank-close", "monthly");
  if (!guard.acquired) return NextResponse.json({ message: guard.reason, skipped: true });
  try {
    const summary = await runBankMonthClose();
    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
}, { timeoutMs: 110_000 });
