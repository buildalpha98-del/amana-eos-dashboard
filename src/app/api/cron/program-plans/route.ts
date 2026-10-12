/**
 * GET /api/cron/program-plans — nightly: each centre's monthly Program Plan
 * from SharePoint into its Program and Menu (src/lib/program-plan/sync.ts).
 * Bearer CRON_SECRET; skipped quietly until Microsoft Graph and Anthropic
 * are configured.
 *
 * Runs hourly 12:00–20:00 UTC (overnight in Sydney). Unchanged files are a
 * quick etag check; reading a new plan or menu takes Claude a minute or two,
 * so a month change across every centre is spread over the night — each run
 * stops STARTING files after 90 seconds (so the last one finishes inside
 * the 300s limit) and the next run carries on.
 */
import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { isProgramPlanSyncConfigured, runProgramPlanSync } from "@/lib/program-plan/sync";

export const maxDuration = 300;

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;
  if (!isProgramPlanSyncConfigured()) {
    return NextResponse.json({ skipped: true, reason: "Microsoft Graph or Anthropic not configured" });
  }
  const guard = await acquireCronLock("program-plans", "hourly");
  if (!guard.acquired) return NextResponse.json({ message: guard.reason, skipped: true });

  try {
    const results = await runProgramPlanSync({ deadline: Date.now() + 90_000 });
    const summary = {
      centres: results.length,
      synced: results.filter((r) => r.status === "synced").length,
      unchanged: results.filter((r) => r.status === "unchanged").length,
      noPlan: results.filter((r) => r.status === "no_plan").map((r) => r.serviceName),
      errors: results.filter((r) => r.status === "error").map((r) => `${r.serviceName}: ${r.message}`),
    };
    logger.info("Program plan sync complete", summary);
    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Program plan sync failed", { error: msg });
    await guard.fail(new Error(msg));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}, { timeoutMs: 290_000 });
