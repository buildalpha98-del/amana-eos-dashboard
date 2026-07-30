/**
 * POST /api/parent/auth/signup
 *
 * 2026-07-30: parents now create their own account BEFORE enrolling,
 * rather than us provisioning one after an anonymous submission.
 *
 * Always returns a generic success — the response must not reveal whether
 * an email is already registered, or sign-up becomes a way to enumerate
 * which families attend.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { createParentAccount, normaliseEmail } from "@/lib/parent-account";
import { parentVerifyEmail } from "@/lib/email-templates/parent-account";

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

  const generic = NextResponse.json({
    success: true,
    message:
      "Check your inbox — we've sent a link to confirm your email address.",
  });

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

  const base = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";
  const link = `${base}/parent/confirm?token=${result.verificationToken}`;

  try {
    const { subject, html } = await parentVerifyEmail({
      name: firstName,
      link,
      alreadyRegistered: result.alreadyExisted,
    });
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    // Never surface a send failure — it would leak that the address exists.
    // Logged so a genuinely broken mailer is still visible to us.
    logger.error("Parent signup: confirmation email failed", { err, email });
  }

  return generic;
});
