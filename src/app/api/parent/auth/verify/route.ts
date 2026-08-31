import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import {
  findEnrolmentIdsForEmail,
  findParentAccountForLogin,
} from "@/lib/parent-account";
import { signParentJwt } from "@/lib/parent-auth";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

export const GET = withApiHandler(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get("token");
  // Redirect back to whatever host the parent actually called us from — more
  // robust than relying on NEXTAUTH_URL (which may point at prod while dev is
  // localhost). Falls back to NEXTAUTH_URL if the request origin is missing.
  const baseUrl =
    req.nextUrl.origin || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const loginErrorUrl = `${baseUrl}/parent/login?error=expired`;

  if (!token) {
    return NextResponse.redirect(loginErrorUrl);
  }

  // Throttle per IP so stolen/guessed tokens can't be tried in bulk. Tokens are
  // 256-bit so brute force is infeasible anyway — this is defence-in-depth.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`parent-verify:${ip}`, 10, 60 * 1000);
  if (rl.limited) {
    logger.warn("Parent verify: rate limited", { ip });
    return NextResponse.redirect(loginErrorUrl);
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Find valid, unused, non-expired link
  const magicLink = await prisma.parentMagicLink.findUnique({
    where: { tokenHash },
  });

  if (!magicLink || magicLink.usedAt || magicLink.expiresAt < new Date()) {
    logger.warn("Parent verify: invalid or expired token", {
      tokenExists: !!magicLink,
      used: !!magicLink?.usedAt,
      expired: magicLink ? magicLink.expiresAt < new Date() : null,
    });
    return NextResponse.redirect(loginErrorUrl);
  }

  // Mark as used
  await prisma.parentMagicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() },
  });

  const emailLower = magicLink.email.toLowerCase().trim();

  /**
   * One shared lookup, not a second copy of it.
   *
   * This route and `send-link` each carried their own ~40-line scan with
   * a hard `take(100)`, unordered. A parent whose enrolment fell outside
   * that slice got a valid magic link that signed them in with ZERO
   * enrolments — the session worked, and their own children weren't in
   * it. `findEnrolmentIdsForEmail` pages the whole table instead.
   */
  const { enrolmentIds: matchingEnrolmentIds, parentName: foundName } =
    await findEnrolmentIdsForEmail(emailLower);

  let parentName = foundName ?? "Parent";
  if (!foundName) {
    const enquiry = await prisma.parentEnquiry.findFirst({
      where: {
        parentEmail: { equals: emailLower, mode: "insensitive" },
        deleted: false,
      },
      select: { parentName: true },
    });
    if (enquiry?.parentName) parentName = enquiry.parentName;
  }

  // Sign JWT
  /**
   * `accountId` too — the password login has always set it, and this
   * didn't.
   *
   * Without it `requireAccountId` refuses the enrolment draft with
   * "Please sign in with your Amana OSHC account to continue your
   * enrolment" — told to a parent who just used the only recovery path
   * they have, about the password they've forgotten. It also made
   * fixing the send side hollow: a link that arrives and then can't
   * reach their half-finished enrolment is barely better than no link.
   */
  const account = await findParentAccountForLogin(emailLower);

  const jwt = await signParentJwt({
    email: emailLower,
    name: parentName,
    enrolmentIds: matchingEnrolmentIds,
    ...(account ? { accountId: account.accountId } : {}),
  });

  logger.info("Parent session created", {
    email: emailLower,
    enrolmentCount: matchingEnrolmentIds.length,
  });

  // Set cookies and redirect. Use ?v2=1 for new parents during the v2 rollout
  // window so the welcome experience is always the redesigned one.
  const response = NextResponse.redirect(`${baseUrl}/parent?v2=1`);
  const cookieMaxAge = 30 * 24 * 60 * 60; // 30 days — matches the parent JWT expiration

  // httpOnly session cookie (not readable by JS — secure)
  response.cookies.set("parent-session", jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge,
  });

  // Non-httpOnly flag cookie for client-side auth check
  // (the actual JWT is still protected; this just signals "logged in")
  response.cookies.set("parent-active", "1", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge,
  });

  return response;
});
