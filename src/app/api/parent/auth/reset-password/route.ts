/**
 * Parent password reset — check a link, then complete it.
 *
 * GET  ?token=…  → is this link still good? (does NOT consume it)
 * POST {token, password} → set the new password
 *
 * INTENTIONALLY UNAUTHENTICATED: the token IS the proof. Both are public
 * because a parent who has forgotten their password has, by definition, no
 * session.
 *
 * The GET exists so the page can say "this link has expired" BEFORE the parent
 * chooses a password, rather than letting them type one, submit, and only then
 * find out. It is a read — nothing is marked used until the POST.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  checkParentPasswordReset,
  completeParentPasswordReset,
  MIN_PASSWORD_LENGTH,
} from "@/lib/parent-password-reset";
import { logger } from "@/lib/logger";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export const GET = withApiHandler(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false, reason: "unknown" });

  // Tokens are 256-bit so brute force is infeasible; this is defence in depth,
  // and matches the throttle on the magic-link verify.
  const rl = await checkRateLimit(`parent-reset-check:${clientIp(req)}`, 20, 60_000);
  if (rl.limited) {
    throw new ApiError(429, "Too many attempts. Please wait a moment.");
  }

  const check = await checkParentPasswordReset(token);
  return NextResponse.json(
    check.ok
      ? { valid: true, email: maskEmail(check.email) }
      : { valid: false, reason: check.reason },
  );
});

const postSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const rl = await checkRateLimit(`parent-reset-submit:${clientIp(req)}`, 10, 60_000);
  if (rl.limited) {
    throw new ApiError(429, "Too many attempts. Please wait a moment.");
  }

  const parsed = postSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      parsed.error.flatten().fieldErrors,
    );
  }

  const { email } = await completeParentPasswordReset(parsed.data);

  logger.info("Parent set a new password", { email });

  /**
   * Deliberately does NOT sign them in.
   *
   * Sending them to the sign-in page to use the password they just chose is
   * the moment they find out it works — and it is the habit worth building,
   * since the next time they open the portal there is no link to click.
   */
  return NextResponse.json({ ok: true });
});

/** "ay***@example.com" — enough to confirm which account, not enough to leak one. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
