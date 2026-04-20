import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTotp, decryptSecret, verifyBackupCode } from "@/lib/totp";
import { checkRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  userId: z.string().min(1, "userId is required"),
  code: z.string().min(6).max(8, "code must be 6-8 characters"),
});

/**
 * POST /api/auth/mfa/verify
 *
 * Verify a TOTP or backup code during login.
 * Called after primary credentials are validated but before session is granted.
 *
 * Body: { userId: string, code: string }
 */
export const POST = withApiHandler(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipRl = await checkRateLimit(`mfa-verify:${ip}`, 10, 15 * 60 * 1000);
  if (ipRl.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { userId, code } = parsed.data;

  // Rate limit per userId to prevent brute-force enumeration
  const userRl = await checkRateLimit(`mfa-verify:${userId}`, 10, 15 * 60 * 1000);
  if (userRl.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabledAt: true, mfaBackupCodes: true },
  });

  // Return same error for user-not-found, MFA-not-enabled, and invalid code
  // to prevent user ID enumeration
  if (!user || !user.mfaEnabledAt || !user.mfaSecret) {
    return NextResponse.json(
      { error: "Invalid verification code" },
      { status: 400 },
    );
  }

  const secret = decryptSecret(user.mfaSecret);

  // Try TOTP code first (6 digits)
  if (/^\d{6}$/.test(code)) {
    if (verifyTotp(secret, code)) {
      return NextResponse.json({ verified: true });
    }
  }

  // Try backup code (8-char hex)
  if (/^[0-9a-f]{8}$/i.test(code)) {
    const { valid, remainingHashes } = verifyBackupCode(code.toLowerCase(), user.mfaBackupCodes);
    if (valid) {
      // Remove used backup code
      await prisma.user.update({
        where: { id: userId },
        data: { mfaBackupCodes: remainingHashes },
      });
      return NextResponse.json({
        verified: true,
        backupCodesRemaining: remainingHashes.length,
      });
    }
  }

  return NextResponse.json(
    { error: "Invalid verification code" },
    { status: 400 },
  );
});
