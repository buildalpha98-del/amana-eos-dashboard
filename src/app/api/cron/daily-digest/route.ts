import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { buildAndSendDailyDigest } from "@/lib/daily-digest";

/**
 * GET /api/cron/daily-digest
 *
 * Daily cron (7 AM AEST / 21:00 UTC) — sends each active user a single
 * notification digest email summarising all unread notifications from the
 * last 24 hours, grouped by type with top 5 items per section.
 *
 * Also includes AI-aggregated insights (anomalies, trends, sentiment)
 * for admin/owner users.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  // Idempotency guard — prevent duplicate digest emails on retry
  const guard = await acquireCronLock("daily-digest", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const result = await buildAndSendDailyDigest();

    await guard.complete({
      totalUsers: result.totalUsers,
      emailsSent: result.emailsSent,
      skipped: result.skipped,
      aiInsights: result.aiInsights,
    });

    return NextResponse.json({
      message: "Daily notification digest processed",
      ...result,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
