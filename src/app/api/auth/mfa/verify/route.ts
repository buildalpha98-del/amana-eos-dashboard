import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTotp, decryptSecret, verifyBackupCode } from "@/lib/totp";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/mfa/verify
 *
 * Verify a TOTP or backup code during login.
 * Called after primary credentials are validated but before session is granted.
 *
 * Body: { userId: string, code: string }
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`mfa-verify:${ip}`, 10, 15 * 60 * 1000);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const { userId, code } = await req.json();

  if (!userId || !code) {
    return NextResponse.json(
      { error: "userId and code are required" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabledAt: true, mfaBackupCodes: true },
  });

  if (!user || !user.mfaEnabledAt || !user.mfaSecret) {
    return NextResponse.json(
      { error: "MFA is not enabled for this user" },
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
    { error: "Invalid code. Please try again." },
    { status: 400 },
  );
}
