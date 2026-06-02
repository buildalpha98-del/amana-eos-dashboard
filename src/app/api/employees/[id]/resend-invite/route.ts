import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { sendEmail, getResend } from "@/lib/email";
import { isEmailSuppressed } from "@/lib/email-suppression";
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

  // issueInvite now reports back whether the email actually went out
  // (vs being suppressed / dropped). Surface that to the caller so
  // the dashboard doesn't tell admin "sent" when nothing was sent.
  const result = await issueInvite(target);

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "resend_invite",
      entityType: "User",
      entityId: target.id,
      details: {
        sent: result.sent,
        suppressed: result.suppressed,
        messageId: result.messageId ?? null,
      },
    },
  });

  if (!result.sent) {
    // Hard fail when the email definitely didn't go out — admin needs
    // to know rather than seeing a green checkmark.
    if (result.reason === "suppressed") {
      throw ApiError.badRequest(
        `${target.email} is on the email suppression list (previously bounced or marked as spam). ` +
          `Verify the address is correct, then ask the staff member to add Amana's sender domain to their allow-list. ` +
          `An admin can clear the suppression from Settings → Email Suppression.`,
      );
    }
    if (result.reason === "not_configured") {
      throw new ApiError(
        503,
        "Email is not configured on this server (RESEND_API_KEY missing). Invite was not sent.",
      );
    }
    throw new ApiError(
      502,
      `Invite send failed: ${result.error ?? "unknown error"}`,
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Invite re-sent to ${target.email}`,
    messageId: result.messageId,
  });
});

/**
 * Result of an invite-send attempt. The caller (single-resend route
 * or bulk-resend) inspects this to decide whether to claim success
 * or surface a failure to the admin.
 *
 *   - `sent: true`   → email handed off to Resend; `messageId` set
 *   - `sent: false`  → nothing went out; `reason` explains why:
 *     "suppressed"       — address is on the suppression list
 *     "not_configured"   — RESEND_API_KEY missing (prod misconfig)
 *     "send_failed"      — Resend's API itself rejected the send
 */
export interface IssueInviteResult {
  sent: boolean;
  suppressed: boolean;
  messageId?: string;
  reason?: "suppressed" | "not_configured" | "send_failed";
  error?: string;
}

/**
 * Issues a password-reset token + emails the link. Exported so the
 * bulk-resend route can call it without duplicating the token logic.
 *
 * 2026-06-02 rewrite — was previously silent on failure. Now returns
 * structured outcome and lets the caller surface failures to the
 * admin instead of falsely claiming "Invite re-sent."
 */
export async function issueInvite(target: {
  id: string;
  name: string;
  email: string;
}): Promise<IssueInviteResult> {
  // Pre-check suppression list. The user-friendly way to fail —
  // admin sees "this address is suppressed" instead of getting a
  // mysteriously-not-arriving invite.
  if (await isEmailSuppressed(target.email)) {
    logger.warn("issueInvite: target email is on the suppression list", {
      userId: target.id,
      email: target.email,
    });
    return {
      sent: false,
      suppressed: true,
      reason: "suppressed",
    };
  }

  // Invalidate any existing unused tokens for this user — every new
  // invite makes the old link dead.
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

  // Production must have Resend configured. Treating this as a
  // soft no-op (the original behaviour) silently breaks invites for
  // the whole org until someone notices.
  const resend = getResend();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      logger.info("Resend-invite link (dev — no Resend configured)", {
        email: target.email,
        resetUrl,
      });
      return { sent: true, suppressed: false, messageId: "dev-stub" };
    }
    logger.error("issueInvite: RESEND_API_KEY missing in production", {
      userId: target.id,
    });
    return {
      sent: false,
      suppressed: false,
      reason: "not_configured",
    };
  }

  // Use the suppression-aware wrapper so any future bounces are
  // recorded centrally. We already pre-checked above but sendEmail
  // also re-checks — defence in depth.
  try {
    const result = await sendEmail({
      to: target.email,
      subject,
      html,
    });
    if (result.sent.length === 0) {
      // Suppression check inside sendEmail caught it (rare given our
      // pre-check, but possible due to race).
      return { sent: false, suppressed: true, reason: "suppressed" };
    }
    return {
      sent: true,
      suppressed: false,
      messageId: result.messageId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("issueInvite: Resend send failed", {
      userId: target.id,
      email: target.email,
      err: message,
    });
    return {
      sent: false,
      suppressed: false,
      reason: "send_failed",
      error: message,
    };
  }
}
