/**
 * POST /api/parent/auth/login — password sign-in for parent accounts.
 *
 * The magic link at /api/parent/auth/send-link remains as the
 * forgot-password path, so a parent without their password can still reach
 * their own enrolment.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  authenticateParent,
  findEnrolmentIdsForEmail,
  normaliseEmail,
} from "@/lib/parent-account";
import { signParentJwt, setParentSessionCookie } from "@/lib/parent-auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = withApiHandler(async (req) => {
  const parsed = loginSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) throw ApiError.badRequest("Enter your email and password.");

  const email = normaliseEmail(parsed.data.email);

  // Matches the staff login policy: 5 attempts / 15 min.
  const rl = await checkRateLimit(`parent-login:${email}`, 5, 15 * 60 * 1000);
  if (rl.limited) {
    throw new ApiError(429, "Too many attempts. Please try again in 15 minutes.");
  }

  const account = await authenticateParent(email, parsed.data.password);
  // Same message for unknown-email and wrong-password — no enumeration.
  if (!account) throw ApiError.unauthorized("Incorrect email or password.");
  if (account.deactivated) {
    throw ApiError.forbidden(
      "This account has been switched off. Please contact your service.",
    );
  }

  const { enrolmentIds, parentName } = await findEnrolmentIdsForEmail(email);

  const jwt = await signParentJwt({
    email: account.email,
    name: account.name ?? parentName ?? "Parent",
    enrolmentIds,
    accountId: account.accountId,
  });

  const res = NextResponse.json({ success: true });
  setParentSessionCookie(res, jwt);
  return res;
});
