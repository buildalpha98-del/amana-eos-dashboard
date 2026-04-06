/**
 * Centralised notification email sender.
 * Wraps the Resend API and logs every send attempt to NotificationLog.
 */

import { sendEmail as resendEmail, FROM_EMAIL } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function sendNotificationEmail({
  to,
  toName,
  subject,
  html,
  type,
  relatedId,
  relatedType,
}: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  type: string;
  relatedId?: string;
  relatedType?: string;
}): Promise<void> {
  try {
    await resendEmail({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    // Log success — wrapped so logging failure never crashes the caller
    try {
      await prisma.notificationLog.create({
        data: {
          type,
          recipientEmail: to,
          recipientName: toName ?? null,
          subject,
          status: "sent",
          relatedId: relatedId ?? null,
          relatedType: relatedType ?? null,
        },
      });
    } catch (logErr) {
      logger.error("Failed to log notification success", { type, to, logErr });
    }
  } catch (sendErr) {
    // Log failure
    try {
      await prisma.notificationLog.create({
        data: {
          type,
          recipientEmail: to,
          recipientName: toName ?? null,
          subject,
          status: "failed",
          errorMessage:
            sendErr instanceof Error ? sendErr.message : String(sendErr),
          relatedId: relatedId ?? null,
          relatedType: relatedType ?? null,
        },
      });
    } catch (logErr) {
      logger.error("Failed to log notification failure", {
        type,
        to,
        logErr,
      });
    }

    // Re-throw so the caller knows it failed
    throw sendErr;
  }
}
