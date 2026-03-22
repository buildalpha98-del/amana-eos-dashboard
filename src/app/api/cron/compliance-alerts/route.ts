import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { complianceAlertEmail, complianceAdminSummaryEmail } from "@/lib/email-templates";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/compliance-alerts
 *
 * Daily cron (7 AM AEST) — checks for expiring compliance certificates
 * and sends email alerts to affected staff + admin summary.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idempotency guard — prevent duplicate compliance alert emails on retry
  const guard = await acquireCronLock("compliance-alerts", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 86400000);
    const in14d = new Date(now.getTime() + 14 * 86400000);
    const in30d = new Date(now.getTime() + 30 * 86400000);

    // Find all certificates expiring within 30 days or already expired
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

    if (expiringCerts.length === 0) {
      return NextResponse.json({ message: "No expiring certificates found", sent: 0 });
    }

    // Categorize by urgency
    const expired: typeof expiringCerts = [];
    const due7d: typeof expiringCerts = [];
    const due14d: typeof expiringCerts = [];
    const due30d: typeof expiringCerts = [];

    for (const cert of expiringCerts) {
      const expiry = new Date(cert.expiryDate);
      if (expiry <= now) {
        expired.push(cert);
      } else if (expiry <= in7d) {
        due7d.push(cert);
      } else if (expiry <= in14d) {
        due14d.push(cert);
      } else {
        due30d.push(cert);
      }
    }

    // Group by user for individual alerts
    const byUser = new Map<
      string,
      {
        name: string;
        email: string;
        certs: { type: string; label: string | null; expiryDate: Date; service: string; urgency: string }[];
      }
    >();

    for (const cert of expiringCerts) {
      if (!cert.user || !cert.user.active) continue;

      const urgency =
        new Date(cert.expiryDate) <= now
          ? "expired"
          : new Date(cert.expiryDate) <= in7d
          ? "7 days"
          : new Date(cert.expiryDate) <= in14d
          ? "14 days"
          : "30 days";

      if (!byUser.has(cert.user.id)) {
        byUser.set(cert.user.id, {
          name: cert.user.name,
          email: cert.user.email,
          certs: [],
        });
      }

      byUser.get(cert.user.id)!.certs.push({
        type: cert.type.replace(/_/g, " ").toUpperCase(),
        label: cert.label,
        expiryDate: cert.expiryDate,
        service: cert.service.name,
        urgency,
      });
    }

    const resend = getResend();
    let emailsSent = 0;
    const errors: string[] = [];

    // Send per-user alerts
    if (resend) {
      for (const [, user] of byUser) {
        try {
          const { subject, html } = complianceAlertEmail(user.name, user.certs);
          await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject,
            html,
          });
          emailsSent++;
        } catch (err) {
          errors.push(`Failed to email ${user.email}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }

      // Send admin summary to all owner/admin users
      const admins = await prisma.user.findMany({
        where: { role: { in: ["owner", "admin"] }, active: true },
        select: { email: true, name: true },
      });

      if (admins.length > 0) {
        const { subject, html } = complianceAdminSummaryEmail({
          expired: expired.length,
          due7d: due7d.length,
          due14d: due14d.length,
          due30d: due30d.length,
          total: expiringCerts.length,
        });

        for (const admin of admins) {
          try {
            await resend.emails.send({
              from: FROM_EMAIL,
              to: admin.email,
              subject,
              html,
            });
            emailsSent++;
          } catch (err) {
            errors.push(`Failed admin email ${admin.email}: ${err instanceof Error ? err.message : "Unknown"}`);
          }
        }
      }
    } else {
      logger.debug("Compliance cron: no Resend API key — logging only", {
        expired: expired.length,
        due7d: due7d.length,
        due14d: due14d.length,
        due30d: due30d.length,
      });
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

    await guard.complete({ total: expiringCerts.length, emailsSent, overdueAudits });

    return NextResponse.json({
      message: "Compliance alerts processed",
      counts: {
        expired: expired.length,
        due7d: due7d.length,
        due14d: due14d.length,
        due30d: due30d.length,
        total: expiringCerts.length,
      },
      emailsSent,
      overdueAudits,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Compliance alert cron failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
});
