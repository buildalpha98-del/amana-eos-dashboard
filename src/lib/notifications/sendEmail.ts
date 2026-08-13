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
    const result = await resendEmail({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    /**
     * Three outcomes, not two.
     *
     * This used to ask only "was the recipient suppressed", so a send
     * the provider REJECTED — unverified domain, rate limit, blocked
     * recipient — was recorded as `status: "sent"`. The ledger then
     * showed a delivery that never happened, which is the worst kind of
     * record to have: it stops anyone looking further.
     */
    const wasSuppressed = result.sent.length === 0 && result.suppressed.length > 0;
    const status = result.failed || wasSuppressed ? "failed" : "sent";
    const errorMessage = result.failed
      ? `Rejected by provider: ${result.failed.message}`
      : wasSuppressed
        ? `Recipient suppressed (bounce/complaint): ${to}`
        : null;

    // Log result — wrapped so logging failure never crashes the caller
    try {
      await prisma.notificationLog.create({
        data: {
          type,
          recipientEmail: to,
          recipientName: toName ?? null,
          subject,
          status,
          errorMessage,
          relatedId: relatedId ?? null,
          relatedType: relatedType ?? null,
        },
      });
    } catch (logErr) {
      logger.error("Failed to log notification result", { type, to, logErr });
    }
  } catch (sendErr) {
    // Log failure — do NOT re-throw. All callers are fire-and-forget
    // with their own try/catch. Re-throwing would cause double-logging.
    logger.error("Notification email failed", {
      type,
      to,
      error: sendErr instanceof Error ? sendErr.message : String(sendErr),
    });

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
  }
}
