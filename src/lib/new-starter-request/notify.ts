/**
 * Notification fan-out for onboarding (new-starter) requests. Mirrors
 * src/lib/creative-request/notify.ts's contract exactly: side-effect-free
 * on failure — the caller has already committed the request row, so every
 * helper try/catches and logs but never throws.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";
import { baseLayout, buttonHtml } from "@/lib/email-templates/base";
import { sendEmail } from "@/lib/email";

type Db = PrismaClient | Prisma.TransactionClient;

export interface NewStarterRequestSummary {
  id: string;
  fullName: string;
  requestedById: string;
}

function link(request: NewStarterRequestSummary): string {
  return `/team?tab=onboarding&open=${request.id}`;
}

/**
 * New starter's account created → every active admin-tier user
 * (owner/head_office/admin), except the submitter themselves. In-app
 * AND email — the account and invite are already sent by the time this
 * fires; this is purely "go do Employment Hero + the contract", which
 * Daniel explicitly wants to land in his inbox, not just the bell.
 */
export async function notifyNewStarterRequestSubmitted(
  db: Db,
  request: NewStarterRequestSummary,
): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: { in: ["owner", "head_office", "admin"] }, active: true },
      select: { id: true, email: true },
    });
    const targets = admins.filter((u) => u.id !== request.requestedById);
    if (targets.length === 0) return;

    await db.userNotification.createMany({
      data: targets.map((u) => ({
        userId: u.id,
        type: NOTIFICATION_TYPES.NEW_STARTER_REQUEST_SUBMITTED,
        title: "New starter onboarded",
        body: `${request.fullName}'s account is set up — complete Employment Hero + their contract`,
        link: link(request),
      })),
    });

    const dashboardUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}${link(request)}`;
    const html = baseLayout(
      `
        <h2 style="margin:0 0 16px;">${escapeHtml(request.fullName)} is onboarding</h2>
        <p>Their dashboard account is created and their invite is on its way. Next up on your end:</p>
        <ul style="padding-left:20px;margin:16px 0;">
          <li style="margin-bottom:8px;">Set them up in Employment Hero payroll</li>
          <li style="margin-bottom:8px;">Prepare and issue their employment contract</li>
        </ul>
        ${buttonHtml("View onboarding request", dashboardUrl)}
      `,
      "staff",
    );
    for (const admin of targets) {
      try {
        await sendEmail({
          to: admin.email,
          subject: `${request.fullName} is onboarding — Employment Hero + contract needed`,
          html,
        });
      } catch (err) {
        logger.error("new-starter-request notify email failed", { err, adminId: admin.id });
      }
    }
  } catch (err) {
    logger.error("new-starter-request notify (submitted) failed", { err, requestId: request.id });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
