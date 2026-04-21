import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { complianceAdminSummaryEmail } from "@/lib/email-templates";

/**
 * Result summary returned by the weekly admin digest.
 *
 * Per-staff alerting (email + in-app + dedup) lives in the daily
 * compliance-alerts cron — this digest is deliberately a read-only
 * roll-up for admin/head_office/owner users.
 */
export interface CertExpiryResult {
  total: number;
  expired: number;
  critical: number;
  warning: number;
  upcoming: number;
  servicesAffected: number;
  emailsSent: number;
  errors?: string[];
}

/**
 * Weekly admin-only compliance digest.
 *
 * Aggregates every cert that is either already expired or expires within
 * 30 days, then emails ONE summary to every admin/head_office/owner.
 *
 *  - expired  = expiryDate <  now
 *  - critical = expiryDate ≤ now + 7d
 *  - warning  = expiryDate ≤ now + 14d
 *  - upcoming = expiryDate ≤ now + 30d
 *
 * No per-staff notifications and no ComplianceCertificateAlert dedup rows
 * are created here — those are owned exclusively by the daily cron.
 */
export async function checkCertExpiry(): Promise<CertExpiryResult> {
  const now = new Date();
  const in30days = new Date(now.getTime() + 30 * 86400000);
  const in7days = new Date(now.getTime() + 7 * 86400000);
  const in14days = new Date(now.getTime() + 14 * 86400000);

  // Everything expired or expiring within 30 days.
  const allCerts = await prisma.complianceCertificate.findMany({
    where: {
      expiryDate: { lte: in30days },
    },
    include: {
      user: { select: { active: true } },
      service: { select: { id: true, name: true } },
    },
    orderBy: { expiryDate: "asc" },
  });

  if (allCerts.length === 0) {
    return {
      total: 0,
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 0,
      servicesAffected: 0,
      emailsSent: 0,
    };
  }

  let expiredCount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let upcomingCount = 0;
  const servicesAffected = new Set<string>();

  for (const cert of allCerts) {
    // Count the cert regardless of whether its owner is active — the admin
    // digest surfaces orphaned certs so someone can re-assign or archive.
    const expiry = new Date(cert.expiryDate);
    if (expiry < now) {
      expiredCount++;
    } else if (expiry <= in7days) {
      criticalCount++;
    } else if (expiry <= in14days) {
      warningCount++;
    } else {
      upcomingCount++;
    }
    if (cert.service?.id) servicesAffected.add(cert.service.id);
  }

  const admins = await prisma.user.findMany({
    where: {
      role: { in: ["owner", "admin", "head_office"] },
      active: true,
    },
    select: { name: true, email: true },
  });

  let emailsSent = 0;
  const errors: string[] = [];

  if (admins.length > 0) {
    const { subject, html } = complianceAdminSummaryEmail({
      expired: expiredCount,
      due7d: criticalCount,
      due14d: warningCount,
      due30d: upcomingCount,
      total: allCerts.length,
    });

    for (const admin of admins) {
      try {
        await sendEmail({
          to: admin.email,
          subject,
          html,
        });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed admin ${admin.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return {
    total: allCerts.length,
    expired: expiredCount,
    critical: criticalCount,
    warning: warningCount,
    upcoming: upcomingCount,
    servicesAffected: servicesAffected.size,
    emailsSent,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
