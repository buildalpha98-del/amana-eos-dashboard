import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import { checkRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import crypto from "crypto";
import { z } from "zod";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  email: z.string().email("Valid email is required"),
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Email is required");
  }
  const { email } = parsed.data;

  // Rate limit: 5 reset requests per 15 minutes per email
  const rl = await checkRateLimit(`pwd-reset:${email.toLowerCase().trim()}`);
  if (rl.limited) {
    throw new ApiError(429, "Too many requests. Please try again later.");
  }

  // Always return success to prevent email enumeration
  const successResponse = NextResponse.json({
    message:
      "If an account with that email exists, a password reset link has been sent.",
  });

  // Look up the user
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || !user.active) {
    // Don't reveal whether user exists
    return successResponse;
  }

  // Invalidate any existing unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  // Generate a secure random token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  // Build the reset URL
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  // Send the email
  const { subject, html } = await passwordResetEmail(
    user.name.split(" ")[0],
    resetUrl
  );

  /**
   * Sent directly rather than through `sendEmail`, deliberately: that
   * wrapper skips suppressed addresses, and an address that bounced
   * once — a full mailbox, a bad forwarder — must still be able to
   * reset its password. Locking someone out of their own account
   * because of an old bounce is the worse failure.
   */
  const resend = getResend();
  if (!resend) {
    /**
     * In development this is the intended path and the link goes to the
     * console. In production it means RESEND_API_KEY is missing, and
     * the user has just been told a link is on its way — so it is an
     * error, not a shrug.
     */
    if (process.env.NODE_ENV === "production") {
      logger.error("Password reset not sent: email is not configured", {
        userId: user.id,
      });
    } else {
      console.log(`[DEV] Password reset link for ${user.email}: ${resetUrl}`);
    }
    return successResponse;
  }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject,
    html,
  });

  /**
   * The SDK resolves with `{ error }` rather than throwing, so this
   * used to pass silently: an unverified sending domain, a rate limit
   * or a blocked recipient all left the user staring at "a link has
   * been sent" with nothing in their inbox and nothing in the logs.
   *
   * Still a 200. The response is identical whether or not the account
   * exists — that is what stops this endpoint being used to enumerate
   * staff email addresses — and a 500 here would leak exactly that, by
   * failing only for addresses that turned out to be real.
   */
  if (error) {
    logger.error("Password reset email rejected by provider", {
      userId: user.id,
      error: error.message,
      name: error.name,
    });
  }

  return successResponse;
});
