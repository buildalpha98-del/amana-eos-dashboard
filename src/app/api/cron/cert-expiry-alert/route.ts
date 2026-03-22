import { NextRequest, NextResponse } from "next/server";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { checkCertExpiry } from "@/lib/cert-expiry";

/**
 * GET /api/cron/cert-expiry-alert
 *
 * Weekly cron (Monday) — sends a clean certificate expiry summary grouped
 * by service. Service managers receive their centre's expiring certs,
 * and admins receive a network-wide overview.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("cert-expiry-alert", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const result = await checkCertExpiry();

    if (result.total === 0) {
      await guard.complete({ total: 0, emailsSent: 0 });
      return NextResponse.json({
        message: "No expiring or recently expired certificates",
        total: 0,
        emailsSent: 0,
      });
    }

    await guard.complete({
      total: result.total,
      expired: result.expired,
      critical: result.critical,
      warning: result.warning,
      upcoming: result.upcoming,
      servicesAffected: result.servicesAffected,
      emailsSent: result.emailsSent,
    });

    return NextResponse.json({
      message: "Certificate expiry alerts sent",
      ...result,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Cron: cert-expiry-alert", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
