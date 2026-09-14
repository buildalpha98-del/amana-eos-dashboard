/**
 * POST /api/onboarding-requests/[id]/resend-invite
 *
 * Re-issue a new starter's dashboard invite.
 *
 * Exists because the first attempt can fail for reasons an admin can
 * actually fix — a suppressed address that needs clearing, a domain that
 * wasn't verified yet, a typo'd email corrected on the User record. Before
 * 2026-09-14 those failures were invisible AND unrecoverable: the account
 * existed with a temp password nobody knew, and the only way out was a
 * password reset the new hire didn't know to ask for.
 *
 * Issues a FRESH temp password and writes it to the user, rather than
 * resending the original. The first one may well have been delivered
 * somewhere it shouldn't have been (that's what a bounce-to-the-wrong-
 * mailbox is), and we don't keep the plaintext anyway.
 *
 * Admin-tier only, and rate-limited: each call mints a new password, so a
 * loop here would repeatedly invalidate a working one.
 */

import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { generateTempPassword } from "@/lib/temp-password";
import { sendWelcomeInvite, inviteDelivered } from "@/lib/staff-invite";
import { logger } from "@/lib/logger";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;

    const request = await prisma.newStarterRequest.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        completedUserId: true,
      },
    });
    if (!request) throw ApiError.notFound("Onboarding request not found");
    if (!request.completedUserId) {
      throw ApiError.badRequest(
        "No dashboard account was created for this request, so there's no invite to resend.",
      );
    }

    // Read the address off the USER, not the request: if the admin fixed a
    // typo on the profile, that correction is the whole point of resending.
    const user = await prisma.user.findUnique({
      where: { id: request.completedUserId },
      select: { id: true, name: true, email: true, active: true },
    });
    if (!user) throw ApiError.notFound("The staff account no longer exists");
    if (!user.active) {
      throw ApiError.badRequest(
        "This staff member is deactivated — reactivate them before resending their invite.",
      );
    }

    const tempPassword = generateTempPassword();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(tempPassword, 12) },
    });

    const invite = await sendWelcomeInvite({
      email: user.email,
      name: user.name ?? request.fullName,
      tempPassword,
    });

    const updated = await prisma.newStarterRequest.update({
      where: { id },
      data: {
        inviteStatus: invite.status,
        inviteError: invite.detail ?? null,
        inviteSentAt: inviteDelivered(invite) ? new Date() : null,
      },
      select: { id: true, inviteStatus: true, inviteError: true, inviteSentAt: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "resend_invite",
        entityType: "NewStarterRequest",
        entityId: id,
        details: { email: user.email, status: invite.status },
      },
    });

    if (!inviteDelivered(invite)) {
      logger.warn("Onboarding invite resend did not deliver", {
        requestId: id,
        status: invite.status,
      });
    }

    return NextResponse.json({
      ...updated,
      // The password was rotated whether or not the email got out. Say so —
      // an admin retrying a suppressed address needs to know the previous
      // invite's password is now dead.
      passwordRotated: true,
      delivered: inviteDelivered(invite),
    });
  },
  {
    roles: ["owner", "head_office", "admin"],
    rateLimit: { max: 10, windowMs: 5 * 60_000 },
  },
);
