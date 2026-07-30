/**
 * POST /api/parent/auth/confirm
 *
 * Consumes a single-use email-confirmation token, marks the address
 * verified, and claims any enrolment already submitted under that email so
 * an existing family keeps its history. Signs the parent straight in on
 * success — they've just proved control of the inbox.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { confirmParentEmail } from "@/lib/parent-account";
import { signParentJwt, setParentSessionCookie } from "@/lib/parent-auth";

const confirmSchema = z.object({ token: z.string().min(16) });

export const POST = withApiHandler(async (req) => {
  const parsed = confirmSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) throw ApiError.badRequest("Invalid confirmation link.");

  // Guessing a 256-bit token is infeasible, but rate-limit anyway so a
  // scripted attempt can't hammer the DB.
  const rl = await checkRateLimit("parent-confirm", 30, 60 * 1000);
  if (rl.limited) {
    throw new ApiError(429, "Too many attempts. Please try again shortly.");
  }

  const result = await confirmParentEmail(parsed.data.token);

  const jwt = await signParentJwt({
    email: result.email,
    name: "Parent",
    enrolmentIds: result.claimedEnrolmentIds,
    accountId: result.accountId,
  });

  const res = NextResponse.json({
    success: true,
    claimedEnrolments: result.claimedEnrolmentIds.length,
  });
  setParentSessionCookie(res, jwt);
  return res;
});
