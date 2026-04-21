import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { checkCertExpiry } from "@/lib/cert-expiry";

/**
 * GET /api/cron/cert-expiry-alert
 *
 * Weekly cron (Monday) — admin-only certificate expiry digest.
 *
 * Emails a single network-wide summary to every admin / head_office / owner.
 * Per-staff alerts and dedup tracking (`ComplianceCertificateAlert`) are
 * owned by the daily `/api/cron/compliance-alerts` cron — this route is
 * deliberately a read-only roll-up.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

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
      message: "Certificate expiry digest sent",
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
