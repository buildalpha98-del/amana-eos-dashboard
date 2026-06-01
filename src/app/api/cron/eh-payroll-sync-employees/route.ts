/**
 * GET /api/cron/eh-payroll-sync-employees
 *
 * Daily cron — refreshes the mapping between dashboard Users and EH
 * Payroll Employees. New starters appear in EH after onboarding;
 * email changes happen; people leave. This run keeps
 * `User.employmentHeroEmployeeId` honest.
 *
 * Sync logic lives in `src/lib/eh-payroll-sync.ts` so the admin
 * "Run sync now" button at /settings/payroll reuses the exact same
 * code (no drift between manual and automatic runs).
 *
 * Auth: Bearer CRON_SECRET. For ad-hoc triggers from a logged-in
 * admin, use `POST /api/eh-payroll/sync` instead — session-auth'd.
 *
 * Scheduled in `vercel.json` at 06:30 UTC (16:30 AEST).
 */

import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { isConfigured } from "@/lib/eh-payroll";
import { runEmployeeSync } from "@/lib/eh-payroll-sync";

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  if (!isConfigured()) {
    return NextResponse.json(
      { skipped: true, reason: "EH Payroll not configured" },
      { status: 200 },
    );
  }

  const guard = await acquireCronLock("eh-payroll-sync-employees", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  let summary;
  try {
    summary = await runEmployeeSync();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("EH Payroll employee sync: failed", { error: msg });
    await guard.fail(new Error(msg));
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Spread so the Record<string, unknown> index-signatures on
  // `logger.info` / `guard.complete` are satisfied — SyncSummary is a
  // typed interface, not Record<string, unknown>, so a direct pass
  // fails strict assignment. `NextResponse.json` doesn't care either way.
  logger.info("EH Payroll employee sync complete", { ...summary });
  if (summary.unmatchedCount > 0) {
    logger.warn("EH Payroll unmatched users", {
      count: summary.unmatchedCount,
      emails: summary.unmatchedSample.map((u) => u.email),
    });
  }

  await guard.complete({ ...summary });
  return NextResponse.json(summary);
});
