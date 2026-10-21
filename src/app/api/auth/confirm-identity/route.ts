/**
 * POST /api/auth/confirm-identity — "confirm it's you" before a sensitive
 * reveal (security brief 2026-10-21, batch 2). Re-checks the password, and
 * the authenticator or backup code when MFA is on, then sets a five-minute
 * proof cookie bound to this person and this login (src/lib/recent-auth.ts).
 *
 * Rate-limited per person (5 / 15 min, the same budget as sign-in) so it
 * can't be used to guess a password from a session left open.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { RECENT_AUTH_COOKIE, RECENT_AUTH_TTL_MS, confirmIdentity } from "@/lib/recent-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  password: z.string().min(1, "Enter your password").max(200),
  mfaCode: z.string().trim().max(20).optional(),
  purpose: z.enum(["payment_reveal"]),
});

export const POST = withApiAuth(
  async (req: NextRequest, session) => {
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid request");

    const key = `confirm-identity:${session.user.id}`;
    const { limited, resetIn } = await checkRateLimit(key, 5, 15 * 60 * 1000);
    if (limited) {
      throw new ApiError(429, `Too many attempts. Try again in ${Math.ceil(resetIn / 60000)} minutes.`);
    }

    let proof: string;
    try {
      proof = await confirmIdentity(req, session, parsed.data);
    } catch (err) {
      await prisma.activityLog
        .create({
          data: {
            userId: session.user.id,
            action: "identity_confirm_failed",
            entityType: "User",
            entityId: session.user.id,
            details: { purpose: parsed.data.purpose },
          },
        })
        .catch(() => {});
      throw err;
    }
    await resetRateLimit(key);

    const res = NextResponse.json({ ok: true, expiresInSeconds: RECENT_AUTH_TTL_MS / 1000 }, {
      headers: { "Cache-Control": "no-store, private, max-age=0" },
    });
    res.cookies.set(RECENT_AUTH_COOKIE, proof, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api",
      maxAge: RECENT_AUTH_TTL_MS / 1000,
    });
    return res;
  },
  // The per-person budget above is the real limit; this only caps bursts.
  { rateLimit: { max: 10, windowMs: 60_000 } },
);
