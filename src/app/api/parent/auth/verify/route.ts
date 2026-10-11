import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { findEnrolmentIdsForEmail, findParentAccountForLogin } from "@/lib/parent-account";
import { signParentJwt } from "@/lib/parent-auth";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

// Email security software may open a link repeatedly, including with HEAD.
// Neither inspection nor browser prefetching may redeem a login token.
// The fragment keeps the token out of confirmation-page server requests.
export function GET(req: NextRequest) {
  const token = tokenSchema.safeParse(req.nextUrl.searchParams.get("token"));
  const target = new URL(token.success ? "/parent/login/confirm" : "/parent/login?error=expired", req.url);
  if (token.success) target.hash = `token=${token.data}`;
  return privateResponse(NextResponse.redirect(target));
}

export function HEAD(req: NextRequest) {
  return GET(req);
}

const PREPARATION_TIMEOUT_MS = 20_000;
const redeem = withApiHandler(async (req: NextRequest) => {
  // Explicit same-origin JSON POST prevents cross-site forms from signing a
  // visitor into somebody else's account (login CSRF).
  if (req.headers.get("origin") !== req.nextUrl.origin ||
      req.headers.get("sec-fetch-site") === "cross-site") {
    throw ApiError.forbidden("Please open your login email in this browser and try again.");
  }
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "Please use the Continue to my account button.");
  }
  const parsed = z.object({ token: tokenSchema }).safeParse(await parseJsonBody(req));
  if (!parsed.success) throw ApiError.badRequest("This login link is not valid. Request a new link.");

  // Only read/prepare in this promise. If the timeout wins, even late
  // completion cannot redeem the link in the background.
  const preparation = (async () => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await checkRateLimit(`parent-verify:${ip}`, 10, 60 * 1000);
    if (rl.limited) throw new ApiError(429, "Too many attempts. Please wait a minute and try again.");

    const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
    const magicLink = await prisma.parentMagicLink.findUnique({ where: { tokenHash } });
    if (!magicLink || magicLink.usedAt || magicLink.expiresAt <= new Date()) {
      throw ApiError.badRequest("This login link has expired or has already been used. Request a new link.");
    }

    // Prepare everything that may fail BEFORE claiming the link. A transient
    // lookup/signing failure must leave the parent able to retry.
    const emailLower = magicLink.email.toLowerCase().trim();

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

    const account = await findParentAccountForLogin(emailLower);

    if (account?.name) parentName = account.name;

    const jwt = await signParentJwt({
      email: emailLower,
      name: parentName,
      enrolmentIds: matchingEnrolmentIds,
      ...(account ? { accountId: account.accountId } : {}),
      sessionVersion: account?.sessionVersion ?? 0,
    });

    return { jwt, magicLink, enrolmentCount: matchingEnrolmentIds.length };
  })();
  let preparationTimer: ReturnType<typeof setTimeout> | undefined;
  let prepared: Awaited<typeof preparation>;
  try {
    prepared = await Promise.race([
      preparation,
      new Promise<never>((_, reject) => {
        preparationTimer = setTimeout(() => reject(new ApiError(504, "Signing in took too long. Please try again.")), PREPARATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (preparationTimer) clearTimeout(preparationTimer);
  }
  const { jwt, magicLink, enrolmentCount } = prepared;

  // One request wins, even if two tabs press Continue at the same time.
  const claimedAt = new Date();
  // Bound lock waits/commit work at the database, where a timed-out
  // transaction rolls back. Do not race a response timer against a write.
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '3s'`;
    return tx.parentMagicLink.updateMany({
      where: { id: magicLink.id, usedAt: null, expiresAt: { gt: claimedAt } },
      data: { usedAt: claimedAt },
    });
  }, { maxWait: 1_000, timeout: 5_000 });
  if (claimed.count !== 1) {
    throw ApiError.badRequest("This login link has expired or has already been used. Request a new link.");
  }

  const response = NextResponse.json({ success: true, next: "/parent?v2=1" });
  const cookieOptions = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  };
  response.cookies.set("parent-session", jwt, { ...cookieOptions, httpOnly: true });
  response.cookies.set("parent-active", "1", { ...cookieOptions, httpOnly: false });
  logger.info("Parent session created", { enrolmentCount });
  return response;
}, { timeoutMs: 0 });

export async function POST(req: NextRequest) {
  return privateResponse(await redeem(req));
}
