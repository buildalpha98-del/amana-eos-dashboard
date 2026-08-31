import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getResend, FROM_EMAIL } from "@/lib/email";
import {
  findEnrolmentIdsForEmail,
  findParentAccountForLogin,
} from "@/lib/parent-account";
import { parentMagicLinkEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

const sendLinkSchema = z.object({
  email: z.string().email(),
});

export const POST = withApiHandler(async (req) => {
  const body = await parseJsonBody(req);
  const parsed = sendLinkSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid email", parsed.error.flatten());
  }

  const { email } = parsed.data;
  const emailLower = email.toLowerCase().trim();

  // Rate limit: 3 per hour per email
  const rl = await checkRateLimit(`parent-magic:${emailLower}`, 3, 60 * 60 * 1000);
  if (rl.limited) {
    throw new ApiError(429, "Too many login requests. Please try again later.");
  }

  // Always return success to avoid leaking email existence
  const successResponse = NextResponse.json({
    success: true,
    message: "If an account exists, a login link has been sent.",
  });

  // The enquiry is consulted only for a friendly NAME now — it used to
  // also narrow the enrolment search by centre, which is what made this
  // work for some parents and not others.
  let parentName: string | null = null;
  const enquiry = await prisma.parentEnquiry.findFirst({
    where: {
      parentEmail: { equals: emailLower, mode: "insensitive" },
      deleted: false,
    },
    select: { parentName: true },
  });
  if (enquiry?.parentName) parentName = enquiry.parentName;

  /**
   * The SQL moved to `findEnrolmentIdsForEmail`.
   *
   * `verify` carried its own copy of this lookup with a different limit,
   * so a parent could receive a working link and land in a session with
   * ZERO enrolments — signed in, with none of their own children. One
   * implementation, both callers.
   */
  const { enrolmentIds: matchingEnrolmentIds, parentName: enrolmentName } =
    await findEnrolmentIdsForEmail(emailLower);
  if (!parentName) parentName = enrolmentName;

  /**
   * The account itself, which is what was missing.
   *
   * This route looked only at `ParentEnquiry` and non-draft
   * `EnrolmentSubmission`. A parent who created an account and hasn't
   * finished their enrolment is in NEITHER — their enrolment is still a
   * draft, and if they signed up directly rather than through an
   * enquiry form there is no enquiry either. So the one group most
   * likely to need a way back in was the one group guaranteed not to
   * get one, while being told a link was on its way.
   */
  const account = await findParentAccountForLogin(emailLower);
  if (!parentName) parentName = account?.name ?? null;

  // Nothing anywhere: return success without sending, so the page can't
  // be used to discover which addresses are registered.
  if (!account && !parentName && matchingEnrolmentIds.length === 0) {
    logger.info("Parent magic link requested for unknown email", { email: emailLower });
    return successResponse;
  }

  const displayName = parentName || "Parent";

  // Generate token
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await prisma.parentMagicLink.create({
    data: {
      email: emailLower,
      tokenHash,
      expiresAt,
    },
  });

  // Send email
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const loginUrl = `${baseUrl}/api/parent/auth/verify?token=${token}`;
  const { subject, html } = await parentMagicLinkEmail(displayName, loginUrl);

  /**
   * Sent directly rather than through `sendEmail`, deliberately.
   *
   * That wrapper skips suppressed addresses, and logging the block was
   * only half the answer: it tells STAFF, while the parent stays locked
   * out of their own child's enrolment until someone reads the log and
   * acts. One bounce months ago, or an unsubscribe from a newsletter,
   * should not cost a family access to their account.
   *
   * Suppression protects sender reputation on mail people can live
   * without. It must not gate account recovery — which is why the staff
   * password reset already bypassed it, and this is the same path for
   * families.
   */
  const resend = getResend();
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      logger.error("Parent magic link not sent: email is not configured", {
        email: emailLower,
      });
    } else {
      console.log(`[DEV] Parent magic link for ${emailLower}: ${loginUrl}`);
    }
    return successResponse;
  }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: emailLower,
    subject,
    html,
  });

  /*
   * Resend resolves with `{ error }` rather than throwing, so the
   * try/catch this replaces never fired — a rejected send was logged as
   * "sent". Still a 200 either way: the response must not differ by
   * whether the account exists.
   */
  if (error) {
    logger.error("Parent magic link rejected by provider", {
      email: emailLower,
      error: error.message,
      name: error.name,
    });
  } else {
    logger.info("Parent magic link sent", { email: emailLower });
  }

  return successResponse;
});
