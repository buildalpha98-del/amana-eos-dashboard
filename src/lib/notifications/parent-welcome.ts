/**
 * Parent welcome invite — sent when an enrolment is approved and a
 * CentreContact is created (or resent on demand via the staff "Resend
 * Invite" button).
 *
 * Uses the same ParentMagicLink table + /api/parent/auth/verify endpoint
 * as the self-serve login flow, but with a longer 30-day TTL so parents
 * who don't check email every day still have a valid link.
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buttonHtml, parentEmailLayout } from "@/lib/email-templates/base";
import { logger } from "@/lib/logger";
import crypto from "crypto";

const PORTAL_URL = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";
const WELCOME_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function issueWelcomeMagicLink(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + WELCOME_TTL_MS);

  await prisma.parentMagicLink.create({
    data: {
      email: email.toLowerCase(),
      tokenHash,
      expiresAt,
    },
  });

  return token;
}

interface SendParentWelcomeInviteOptions {
  contactId: string;
  /** Override the child name in the greeting (defaults to "your child"). */
  childFirstName?: string;
  /** If true, phrase copy as a resend ("Here's a fresh link...") rather than first-time. */
  resend?: boolean;
}

/**
 * Issue a magic link for the parent and send them the welcome invite email.
 *
 * Safe to call multiple times (staff clicks "Resend Invite"). Each call
 * creates a fresh ParentMagicLink row. Returns the recipient email for
 * UI confirmation ("Invite sent to jayden@example.com").
 */
export async function sendParentWelcomeInvite(
  opts: SendParentWelcomeInviteOptions,
): Promise<{ sent: boolean; email?: string }> {
  const contact = await prisma.centreContact.findUnique({
    where: { id: opts.contactId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      service: { select: { name: true } },
    },
  });
  if (!contact) {
    logger.warn("sendParentWelcomeInvite: contact not found", { contactId: opts.contactId });
    return { sent: false };
  }

  try {
    const token = await issueWelcomeMagicLink(contact.email);
    const link = `${PORTAL_URL}/api/parent/auth/verify?token=${encodeURIComponent(token)}`;
    const parentName = contact.firstName || "there";
    const childName = opts.childFirstName || "your child";
    const centreName = contact.service?.name ?? "Amana OSHC";

    const greetingHtml = opts.resend
      ? `<h2 style="margin:0 0 12px;color:#111827;font-size:18px;font-weight:600;">
           Here&apos;s a fresh link to log in
         </h2>
         <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
           Assalamu Alaikum ${parentName},
         </p>
         <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
           Tap the button below to log straight into your Amana OSHC parent portal.
           This link is valid for 30 days.
         </p>`
      : `<h2 style="margin:0 0 12px;color:#111827;font-size:18px;font-weight:600;">
           Welcome to ${centreName}
         </h2>
         <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
           Assalamu Alaikum ${parentName},
         </p>
         <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
           ${childName}&apos;s enrolment at <strong>${centreName}</strong> has been approved.
           Your parent portal account is ready — tap the button below to log in and
           take a look. You can see today&apos;s sessions, book casuals, message us, and
           keep all your details up to date.
         </p>
         <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
           This link is valid for 30 days. After that, you can always request a fresh
           link from the portal login page.
         </p>`;

    const subject = opts.resend
      ? `Your Amana OSHC portal log-in link`
      : `Welcome to ${centreName} — your parent portal is ready`;

    const html = parentEmailLayout(`
      ${greetingHtml}
      ${buttonHtml("Log in to your portal", link)}
      <p style="margin:16px 0 0;color:#9ca3af;font-size:13px;line-height:1.5;">
        Jazak Allahu Khairan,<br/>
        The Amana OSHC Team
      </p>
    `);

    await sendEmail({ to: contact.email, subject, html });

    await prisma.notificationLog.create({
      data: {
        type: opts.resend ? "parent_invite_resent" : "parent_welcome_invite",
        recipientEmail: contact.email,
        recipientName: parentName,
        subject,
        status: "sent",
        relatedId: contact.id,
        relatedType: "CentreContact",
      },
    });

    return { sent: true, email: contact.email };
  } catch (err) {
    logger.error("Failed to send parent welcome invite", {
      contactId: opts.contactId,
      err,
    });
    return { sent: false, email: contact.email };
  }
}
