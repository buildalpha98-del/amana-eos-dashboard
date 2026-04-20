import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { baseLayout } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

/**
 * Document Expiry Cron
 *
 * Runs weekly (Monday 7am AEST = Sunday 21:00 UTC).
 * Finds documents expiring within 30 days and already-expired documents.
 * Sends summary emails to service coordinators.
 */
export const GET = withApiHandler(async (req) => {
  const authError = verifyCronSecret(req);
  if (authError) return authError.error;

  const guard = await acquireCronLock("document-expiry", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Find documents expiring within 30 days (not yet expired)
    const expiringDocs = await prisma.childDocument.findMany({
      where: {
        expiresAt: {
          gt: now,
          lte: thirtyDaysFromNow,
        },
      },
      include: {
        child: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            serviceId: true,
          },
        },
      },
      orderBy: { expiresAt: "asc" },
    });

    // Find already-expired documents
    const expiredDocs = await prisma.childDocument.findMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
      include: {
        child: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            serviceId: true,
          },
        },
      },
      orderBy: { expiresAt: "asc" },
    });

    if (expiringDocs.length === 0 && expiredDocs.length === 0) {
      await guard.complete({ expiring: 0, expired: 0, emailsSent: 0 });
      return NextResponse.json({ message: "No expiring or expired documents found", emailsSent: 0 });
    }

    // Group by service → find coordinator
    const serviceIds = new Set<string>();
    for (const doc of [...expiringDocs, ...expiredDocs]) {
      if (doc.child.serviceId) serviceIds.add(doc.child.serviceId);
    }

    // Find coordinators for each service
    const coordinators = await prisma.user.findMany({
      where: {
        role: { in: ["owner", "admin"] },
        active: true,
      },
      select: { id: true, email: true, name: true },
    });

    if (coordinators.length === 0) {
      logger.warn("Document expiry cron: no coordinators found");
      await guard.complete({ expiring: expiringDocs.length, expired: expiredDocs.length, emailsSent: 0, reason: "no coordinators" });
      return NextResponse.json({ message: "No coordinators to notify", emailsSent: 0 });
    }

    const resend = getResend();
    let emailsSent = 0;

    // Send expiring documents email
    if (expiringDocs.length > 0 && resend) {
      const tableRows = expiringDocs.map((doc) => {
        const daysLeft = Math.ceil((new Date(doc.expiresAt!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${doc.child.firstName} ${doc.child.surname}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${formatDocType(doc.documentType)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${doc.fileName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${daysLeft <= 7 ? "#dc2626" : "#d97706"};">${new Date(doc.expiresAt!).toLocaleDateString("en-AU")} (${daysLeft}d)</td>
        </tr>`;
      }).join("");

      const html = baseLayout(`
        <h2 style="margin:0 0 8px;font-size:18px;color:#1a1a2e;">Documents Expiring Soon</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
          ${expiringDocs.length} document${expiringDocs.length !== 1 ? "s" : ""} will expire within the next 30 days.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background-color:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Child</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Type</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Document</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Expires</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      `);

      for (const coord of coordinators) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: coord.email!,
            subject: `Documents expiring soon \u2014 ${expiringDocs.length} document${expiringDocs.length !== 1 ? "s" : ""} need attention`,
            html,
          });
          emailsSent++;
        } catch (err) {
          logger.error("Document expiry cron: email send failed", { error: err, to: coord.email });
        }
      }
    }

    // Send expired documents email
    if (expiredDocs.length > 0 && resend) {
      const tableRows = expiredDocs.map((doc) => {
        const daysAgo = Math.ceil((now.getTime() - new Date(doc.expiresAt!).getTime()) / (1000 * 60 * 60 * 24));
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${doc.child.firstName} ${doc.child.surname}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${formatDocType(doc.documentType)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${doc.fileName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#dc2626;">${new Date(doc.expiresAt!).toLocaleDateString("en-AU")} (${daysAgo}d ago)</td>
        </tr>`;
      }).join("");

      const html = baseLayout(`
        <h2 style="margin:0 0 8px;font-size:18px;color:#dc2626;">Expired Documents \u2014 Action Required</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
          ${expiredDocs.length} document${expiredDocs.length !== 1 ? "s" : ""} have expired and require immediate attention.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background-color:#fef2f2;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Child</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Type</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Document</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Expired</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      `);

      for (const coord of coordinators) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: coord.email!,
            subject: `Expired documents \u2014 action required`,
            html,
          });
          emailsSent++;
        } catch (err) {
          logger.error("Document expiry cron: expired email send failed", { error: err, to: coord.email });
        }
      }
    }

    logger.info("Document expiry cron completed", {
      expiring: expiringDocs.length,
      expired: expiredDocs.length,
      emailsSent,
    });

    await guard.complete({
      expiring: expiringDocs.length,
      expired: expiredDocs.length,
      emailsSent,
    });

    return NextResponse.json({
      expiring: expiringDocs.length,
      expired: expiredDocs.length,
      emailsSent,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});

const DOC_TYPE_MAP: Record<string, string> = {
  ANAPHYLAXIS_PLAN: "Anaphylaxis Plan",
  ASTHMA_PLAN: "Asthma Plan",
  MEDICAL_CERTIFICATE: "Medical Certificate",
  IMMUNISATION_RECORD: "Immunisation Record",
  COURT_ORDER: "Court Order",
  OTHER: "Other",
};

function formatDocType(type: string): string {
  return DOC_TYPE_MAP[type] ?? type;
}
