/**
 * GET /api/cron/sharepoint-policies — daily: brings the SharePoint
 * policies & procedures master folder into the Policies library
 * (src/lib/sharepoint-policies.ts). Bearer CRON_SECRET; skipped quietly
 * until the Microsoft Graph app registration env vars are set.
 * Scheduled in vercel.json at 15:00 UTC (01:00 Sydney).
 */
import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import {
  isSharepointPolicySyncConfigured,
  runSharepointPolicySync,
} from "@/lib/sharepoint-policies";

export const maxDuration = 300;

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;
  if (!isSharepointPolicySyncConfigured()) {
    return NextResponse.json({ skipped: true, reason: "Microsoft Graph not configured" });
  }
  const guard = await acquireCronLock("sharepoint-policies", "daily");
  if (!guard.acquired) return NextResponse.json({ message: guard.reason, skipped: true });

  try {
    const summary = await runSharepointPolicySync();
    logger.info("SharePoint policy sync complete", { ...summary });
    await guard.complete({ ...summary });
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("SharePoint policy sync failed", { error: msg });
    await guard.fail(new Error(msg));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  // A batch of PDF conversions outlasts the 55s default.
}, { timeoutMs: 290_000 });
