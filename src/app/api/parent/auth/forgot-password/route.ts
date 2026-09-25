/**
 * POST /api/parent/auth/forgot-password — a parent asks to reset their password.
 *
 * INTENTIONALLY UNAUTHENTICATED. Before this existed, the sign-in page's
 * "Forgot your password?" sent a magic LOGIN link: it got them in but left the
 * forgotten password untouched, so the next sign-in stalled the same way and
 * the family's honest report was "the reset link doesn't work".
 *
 * Responds 200 whether or not the address has an account — the reply must not
 * be a way to discover which families are registered.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { normaliseEmail } from "@/lib/parent-account";
import {
  createParentPasswordReset,
  parentResetUrl,
} from "@/lib/parent-password-reset";
import { parentPasswordResetEmail } from "@/lib/email-templates/parent-portal";
import { logger } from "@/lib/logger";

const schema = z.object({ email: z.string().email() });

export const POST = withApiHandler(async (req) => {
  const parsed = schema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid email", parsed.error.flatten());
  }

  const emailLower = normaliseEmail(parsed.data.email);

  // 3 an hour per address — enough for a parent who mistypes or loses the
  // first email, tight enough that this isn't a way to mailbomb a family.
  const rl = await checkRateLimit(
    `parent-reset:${emailLower}`,
    3,
    60 * 60 * 1000,
  );
  if (rl.limited) {
    throw new ApiError(
      429,
      "Too many reset requests. Please try again in an hour.",
    );
  }

  // Identical response on every path below.
  const ok = NextResponse.json({
    success: true,
    message: "If an account exists, a password reset link has been sent.",
  });

  const account = await prisma.parentAccount.findUnique({
    where: { email: emailLower },
    select: { firstName: true, deactivatedAt: true },
  });

  if (!account) {
    logger.info("Parent password reset requested for unknown email", {
      email: emailLower,
    });
    return ok;
  }

  // A deactivated family gets the same silent 200. Letting them set a
  // password they still can't sign in with is a worse experience than the
  // email simply not arriving, and staff switched the access off on purpose.
  if (account.deactivatedAt) {
    logger.info("Parent password reset requested for deactivated account", {
      email: emailLower,
    });
    return ok;
  }

  const { token } = await createParentPasswordReset(emailLower);
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const { subject, html } = await parentPasswordResetEmail(
    account.firstName || "there",
    parentResetUrl(baseUrl, token),
  );

  /**
   * Sent directly rather than through `sendEmail`, matching the magic-link
   * route and for the same reason: that wrapper drops suppressed addresses.
   * A bounce months ago, or an unsubscribe from a newsletter, must not cost a
   * family the ability to get back into their own account. Suppression
   * protects sender reputation on mail people can live without; account
   * recovery is not that.
   */
  const resend = getResend();
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      logger.error("Parent password reset not sent: email is not configured", {
        email: emailLower,
      });
    } else {
      console.log(
        `[DEV] Parent password reset for ${emailLower}: ${parentResetUrl(baseUrl, token)}`,
      );
    }
    return ok;
  }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: emailLower,
    subject,
    html,
  });

  // Resend resolves with `{ error }` rather than throwing. Still a 200 either
  // way — the response must not vary by whether the account exists.
  if (error) {
    logger.error("Parent password reset rejected by provider", {
      email: emailLower,
      error: error.message,
    });
  } else {
    logger.info("Parent password reset sent", { email: emailLower });
  }

  return ok;
});
