import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

/**
 * POST /api/employees/[id]/resend-invite
 *
 * Re-issues an invite to a PENDING staff member (lastLoginAt = null,
 * active = true). The invite is sent as a password-reset link rather
 * than a fresh temp password — the original temp password is still
 * valid, but a reset link is the kinder UX since the user can choose
 * their own password and the old emailed temp password becomes
 * effectively obsolete the moment they use the link.
 *
 * Admin-only. Activity-logged. The single-user analogue of
 * `/api/users/bulk-resend-invite`.
 */
export const POST = withApiAuth(async (_req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  if (!isAdminRole(session!.user.role)) {
    throw ApiError.forbidden("Admin required");
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      lastLoginAt: true,
    },
  });
  if (!target) throw ApiError.notFound("Employee not found");
  if (!target.active) {
    throw ApiError.badRequest("Cannot resend invite to a deactivated user");
  }
  if (target.lastLoginAt) {
    throw ApiError.badRequest(
      "User has already signed in — use Reset password instead",
    );
  }

  await issueInvite(target);

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "resend_invite",
      entityType: "User",
      entityId: target.id,
    },
  });

  return NextResponse.json({
    ok: true,
    message: `Invite re-sent to ${target.email}`,
  });
});

/**
 * Issues a password-reset token + emails the link. Exported so the
 * bulk-resend route can call it without duplicating the token logic.
 */
export async function issueInvite(target: {
  id: string;
  name: string;
  email: string;
}): Promise<void> {
  // Invalidate any existing unused tokens for this user.
  await prisma.passwordResetToken.updateMany({
    where: { userId: target.id, used: false },
    data: { used: true },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { token, userId: target.id, expiresAt },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const { subject, html } = await passwordResetEmail(
    target.name.split(" ")[0],
    resetUrl,
  );
  const resend = getResend();
  if (resend) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: target.email,
      subject,
      html,
    });
  } else if (process.env.NODE_ENV !== "production") {
    logger.info("Resend-invite link (dev)", { email: target.email, resetUrl });
  }
}
