/**
 * POST /api/parent/auth/signup
 *
 * 2026-07-30: parents now create their own account BEFORE enrolling,
 * rather than us provisioning one after an anonymous submission.
 *
 * 2026-07-31: sign-up now creates the account AND signs them straight in,
 * landing them on the enrolment form. Daniel: making a family go and find
 * a confirmation email before they can even see the form was turning
 * people away at the doorstep. Verification moved to the
 * enrolment-approval email, by which point the address has to work
 * anyway.
 *
 * DELIBERATE TRADE-OFF: because we now issue a session, we can no longer
 * give an identical response for a taken email. Doing so would mean
 * either logging someone into an account they don't own (one-step
 * takeover of a real family's child records) or returning "success" with
 * no session and stranding them. So a taken address now says so. That
 * leaks whether an email is registered — accepted knowingly, because the
 * alternative is far worse. Everything else stays: bcrypt cost 12, HIBP
 * breach check, rate limiting.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import {
  createParentAccount,
  findEnrolmentIdsForEmail,
  normaliseEmail,
} from "@/lib/parent-account";
import { parentVerifyEmail } from "@/lib/email-templates/parent-account";
import { setParentSessionCookie, signParentJwt } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { resolveRefCode } from "@/lib/ambassadors/ref-codes";

const signupSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  // 10 chars: this is a family-facing password guarding health and payment
  // data, so it sits above the 8-char staff minimum. Breach-checked in
  // createParentAccount.
  password: z.string().min(10, "Password must be at least 10 characters"),
  // 2026-07-30: parents give ONE "Full name" field, matching how they
  // think of it. Split on the last space for storage, since firstName is
  // what we address them by in email and surname is what staff sort on.
  // A single-word name keeps the whole thing as firstName rather than
  // inventing an empty surname.
  fullName: z.string().trim().min(1, "Enter your full name").max(200),
  // 2026-08-03 (Ambassadors): educator referral code carried in from
  // /parent/signup?ref=. Optional; unknown/inactive codes are silently
  // dropped — a mistyped flyer must never block a family signing up.
  refCode: z.string().trim().max(12).optional(),
});

export const POST = withApiHandler(async (req) => {
  const parsed = signupSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0].message);
  }
  const email = normaliseEmail(parsed.data.email);

  // 5/hour per email — enough for a genuine retry, not enough to grind.
  const rl = await checkRateLimit(`parent-signup:${email}`, 5, 60 * 60 * 1000);
  if (rl.limited) {
    throw new ApiError(429, "Too many sign-up attempts. Please try again later.");
  }

  // Split the single "Full name" field for storage: firstName is what we
  // address them by in email, surname is what staff sort on. A one-word
  // name stays whole rather than inventing an empty surname.
  const nameParts = parsed.data.fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? parsed.data.fullName;
  const surname = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  const result = await createParentAccount({
    email,
    password: parsed.data.password,
    firstName,
    surname,
  });

  // ── Address already taken ────────────────────────────────────────────
  // Never issue a session for an account this request didn't create.
  if (!result.mayAutoLogin) {
    const base = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";
    try {
      const { subject, html } = await parentVerifyEmail({
        name: firstName,
        link: `${base}/parent/login`,
        alreadyRegistered: true,
      });
      await sendEmail({ to: email, subject, html });
    } catch (err) {
      logger.error("Parent signup: already-registered notice failed", {
        err,
        email,
      });
    }
    throw new ApiError(
      409,
      "You already have an account with this email. Please sign in instead — you can reset your password from the sign-in page if you've forgotten it.",
    );
  }

  // ── Brand new: sign them in and send them to the form ────────────────

  // Ambassadors: persist a VALID educator ref code on the account so the
  // enrolment submission can resolve attribution later. Never fails signup.
  if (parsed.data.refCode) {
    try {
      const ref = await resolveRefCode(parsed.data.refCode);
      if (ref) {
        await prisma.parentAccount.update({
          where: { id: result.accountId },
          data: { ambassadorRefCode: ref.code },
        });
      }
    } catch (err) {
      logger.warn("Parent signup: ref code persist failed", { err });
    }
  }

  const { enrolmentIds, parentName } = await findEnrolmentIdsForEmail(email);

  const jwt = await signParentJwt({
    email,
    name: [firstName, surname].filter(Boolean).join(" ") || parentName || "Parent",
    enrolmentIds,
    accountId: result.accountId,
  });

  const res = NextResponse.json({
    success: true,
    redirectTo: "/parent/enrol",
  });
  setParentSessionCookie(res, jwt);

  logger.info("Parent account created and signed in", {
    accountId: result.accountId,
  });

  return res;
});
