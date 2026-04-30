import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { complianceAlertEmail } from "@/lib/email-templates";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

/**
 * GET /api/cron/compliance-alerts
 *
 * Daily cron (7 AM AEST) — canonical per-staff compliance expiry flow.
 *
 * Flow:
 *  1. Load certs with `expiryDate <= now + 30d` (includes already-expired).
 *  2. For each cert, compute `daysUntil` and pick a cadence threshold
 *     (30 | 14 | 7 | 0). Certs outside that window are skipped.
 *  3. Dedup via `ComplianceCertificateAlert` (unique on certId + threshold):
 *     if a row already exists, skip (prevents duplicate emails on retry).
 *  4. Email the staff owner (cc the service coordinators) using the
 *     existing `complianceAlertEmail` template.
 *  5. Create a `UserNotification` row so the bell surfaces the alert.
 *  6. Insert the dedup marker as the LAST step — failures before the
 *     marker leave the cert available to retry on the next run.
 *
 * Also escalates any `auditInstance` rows whose `dueDate < now` and
 * whose status is still `scheduled` (unchanged from the prior behaviour).
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  // Idempotency guard — prevent duplicate compliance alert emails on retry
  const guard = await acquireCronLock("compliance-alerts", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 86400000);

    // Find all certificates expiring within 30 days or already expired.
    const expiringCerts = await prisma.complianceCertificate.findMany({
      where: {
        expiryDate: { lte: in30d },
      },
      include: {
        user: { select: { id: true, name: true, email: true, active: true } },
        service: { select: { id: true, name: true, code: true } },
      },
      orderBy: { expiryDate: "asc" },
    });

    const resend = getResend();
    let emailsSent = 0;
    let notificationsCreated = 0;
    let alertsRecorded = 0;
    let skippedDuplicates = 0;
    const errors: string[] = [];

    // Per-service coordinator email cache — a cert's CC list only depends
    // on its serviceId, so we cache to avoid N queries per run.
    const coordinatorCache = new Map<string, string[]>();

    for (const cert of expiringCerts) {
      // A cert without an active staff owner has no-one to notify per-staff.
      // Skip rather than emit a summary (that is the admin digest's job).
      if (!cert.user || !cert.user.active) continue;

      const daysUntil = daysBetween(now, cert.expiryDate);
      const threshold = pickThreshold(daysUntil);
      if (threshold === null) continue;

      // Dedup: if we have already sent this (cert, threshold) pair, skip.
      const existing = await prisma.complianceCertificateAlert.findUnique({
        where: {
          certificateId_threshold: {
            certificateId: cert.id,
            threshold,
          },
        },
      });
      if (existing) {
        skippedDuplicates++;
        continue;
      }

      // Resolve coordinator CC list (cached per serviceId).
      let coordinatorEmails = coordinatorCache.get(cert.serviceId);
      if (!coordinatorEmails) {
        const coordinators = await prisma.user.findMany({
          where: {
            role: "coordinator",
            serviceId: cert.serviceId,
            active: true,
          },
          select: { email: true },
        });
        coordinatorEmails = coordinators.map((c) => c.email);
        coordinatorCache.set(cert.serviceId, coordinatorEmails);
      }

      const expiryDateStr = cert.expiryDate.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const typeLabel = cert.label || cert.type.replace(/_/g, " ").toUpperCase();
      const { title, body, notifType, urgency } = notificationCopy(
        threshold,
        typeLabel,
        expiryDateStr,
      );

      // Send email. If no Resend key we still create the in-app notif and
      // dedup row so the cron is usable in dev without email.
      if (resend) {
        try {
          const toList = [cert.user.email, ...coordinatorEmails.filter((e) => e !== cert.user!.email)];
          const { subject, html } = complianceAlertEmail(cert.user.name, [
            {
              type: typeLabel,
              label: cert.label,
              expiryDate: cert.expiryDate,
              service: cert.service.name,
              urgency,
            },
          ]);
          await resend.emails.send({
            from: FROM_EMAIL,
            to: toList,
            subject,
            html,
          });
          emailsSent++;
        } catch (err) {
          errors.push(
            `Failed to email ${cert.user.email} (cert ${cert.id}, threshold ${threshold}): ${
              err instanceof Error ? err.message : "Unknown"
            }`,
          );
          // Don't record dedup on email failure — let it retry next run.
          continue;
        }
      }

      // In-app notification for the bell.
      try {
        await prisma.userNotification.create({
          data: {
            userId: cert.user.id,
            type: notifType,
            title,
            body,
            link: `/staff/${cert.user.id}?tab=compliance`,
          },
        });
        notificationsCreated++;
      } catch (err) {
        errors.push(
          `Failed notification for user ${cert.user.id} (cert ${cert.id}): ${
            err instanceof Error ? err.message : "Unknown"
          }`,
        );
        // Still record dedup — the email already went out; re-running
        // would double-send. Bell gap is acceptable vs duplicate email.
      }

      // Dedup marker — must be last so we only record when the work
      // (email send) actually succeeded.
      try {
        await prisma.complianceCertificateAlert.create({
          data: {
            certificateId: cert.id,
            threshold,
            channels: ["email", "in_app"],
          },
        });
        alertsRecorded++;
      } catch (err) {
        // Unique constraint race — another instance beat us. Safe to ignore.
        const prismaErr = err as { code?: string };
        if (prismaErr.code !== "P2002") {
          errors.push(
            `Failed dedup marker (cert ${cert.id}, threshold ${threshold}): ${
              err instanceof Error ? err.message : "Unknown"
            }`,
          );
        }
      }
    }

    // ── Overdue Audit Escalation ──────────────────────────────
    let overdueAudits = 0;
    try {
      const overdue = await prisma.auditInstance.findMany({
        where: {
          status: "scheduled",
          dueDate: { lt: now },
        },
        include: {
          template: { select: { name: true, qualityArea: true } },
          service: { select: { id: true, name: true } },
        },
      });

      if (overdue.length > 0) {
        // Update status to overdue
        await prisma.auditInstance.updateMany({
          where: {
            id: { in: overdue.map((o) => o.id) },
          },
          data: { status: "overdue" },
        });

        overdueAudits = overdue.length;

        // Create urgent todos for each overdue audit
        for (const audit of overdue) {
          await prisma.coworkTodo.create({
            data: {
              centreId: audit.service.id,
              date: now,
              title: `OVERDUE: ${audit.template.name} (QA${audit.template.qualityArea})`,
              description: `This audit was due ${audit.dueDate.toLocaleDateString("en-AU")} and has not been completed. Please complete immediately.`,
              category: "morning-prep",
              assignedRole: "coordinator",
            },
          });
        }

        // Create escalation announcement
        const serviceNames = [...new Set(overdue.map((o) => o.service.name))];
        await prisma.coworkAnnouncement.create({
          data: {
            title: `${overdue.length} Overdue Audit${overdue.length === 1 ? "" : "s"} — Action Required`,
            body: `The following centres have overdue audits: ${serviceNames.join(", ")}. Please complete them immediately to maintain compliance.`,
            type: "reminder",
            targetCentres: [...new Set(overdue.map((o) => o.service.id))],
            pinned: true,
          },
        });
      }
    } catch (auditErr) {
      logger.error("Overdue audit escalation failed", { err: auditErr });
    }

    if (!resend && expiringCerts.length > 0) {
      logger.debug("Compliance cron: no Resend API key — in-app only", {
        processed: expiringCerts.length,
        notificationsCreated,
      });
    }

    await guard.complete({
      processed: expiringCerts.length,
      emailsSent,
      notificationsCreated,
      alertsRecorded,
      skippedDuplicates,
      overdueAudits,
    });

    return NextResponse.json({
      message: "Compliance alerts processed",
      processed: expiringCerts.length,
      emailsSent,
      notificationsCreated,
      alertsRecorded,
      skippedDuplicates,
      overdueAudits,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Compliance alert cron failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});

/**
 * Days between two dates (end - start), rounded toward zero.
 * A cert expiring today → 0. Expiring tomorrow → 1. Expired yesterday → -1.
 *
 * Uses UTC-normalised day boundaries so tests and runtime aren't skewed
 * by the caller's local clock running a few minutes past midnight.
 */
function daysBetween(start: Date, end: Date): number {
  const MS_PER_DAY = 86400000;
  const startDay = Math.floor(start.getTime() / MS_PER_DAY);
  const endDay = Math.floor(end.getTime() / MS_PER_DAY);
  return endDay - startDay;
}

/**
 * Bucket a cert into the 30 / 14 / 7 / 0 cadence, or null if outside the
 * alert window.
 *
 * - daysUntil <= 0  → 0  (expired)
 * - 1..7            → 7  (7-day warning)
 * - 8..14           → 14
 * - 15..30          → 30
 * - > 30            → null (not yet within 30 days)
 */
function pickThreshold(daysUntil: number): 30 | 14 | 7 | 0 | null {
  if (daysUntil <= 0) return 0;
  if (daysUntil <= 7) return 7;
  if (daysUntil <= 14) return 14;
  if (daysUntil <= 30) return 30;
  return null;
}

function notificationCopy(
  threshold: 30 | 14 | 7 | 0,
  typeLabel: string,
  expiryDateStr: string,
): {
  title: string;
  body: string;
  notifType: string;
  urgency: string;
} {
  if (threshold === 0) {
    return {
      title: "Certificate expired",
      body: `Your ${typeLabel} certificate expired ${expiryDateStr}.`,
      notifType: NOTIFICATION_TYPES.CERT_EXPIRED,
      urgency: "expired",
    };
  }
  if (threshold === 7) {
    return {
      title: "Certificate expiring in 7 days",
      body: `Your ${typeLabel} certificate expires ${expiryDateStr}.`,
      notifType: NOTIFICATION_TYPES.CERT_EXPIRING_7D,
      urgency: "7 days",
    };
  }
  if (threshold === 14) {
    return {
      title: "Certificate expiring in 14 days",
      body: `Your ${typeLabel} certificate expires ${expiryDateStr}.`,
      notifType: NOTIFICATION_TYPES.CERT_EXPIRING_14D,
      urgency: "14 days",
    };
  }
  return {
    title: "Certificate expiring in 30 days",
    body: `Your ${typeLabel} certificate expires ${expiryDateStr}.`,
    notifType: NOTIFICATION_TYPES.CERT_EXPIRING_30D,
    urgency: "30 days",
  };
}
