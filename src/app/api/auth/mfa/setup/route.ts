import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSecret, generateTotpUri, verifyTotp, generateBackupCodes } from "@/lib/totp";
import { logAuditEvent } from "@/lib/audit-log";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const bodySchema = z.object({
  code: z.string().min(6).max(8).optional(),
});

/**
 * POST /api/auth/mfa/setup
 *
 * Step 1: Generate TOTP secret and return QR data (otpauth URI).
 * Step 2: User submits a verification code to confirm setup.
 *
 * Body: {} (step 1) or { code: "123456" } (step 2)
 */
export const POST = withApiAuth(async (req, session) => {
const userId = session!.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, mfaEnabledAt: true, mfaSecret: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { code } = parsed.data;

  // Step 2: Verify code and activate MFA
  if (code) {
    if (!user.mfaSecret) {
      return NextResponse.json(
        { error: "No MFA setup in progress. Start setup first." },
        { status: 400 },
      );
    }

    if (user.mfaEnabledAt) {
      return NextResponse.json(
        { error: "MFA is already enabled." },
        { status: 400 },
      );
    }

    // Decrypt and verify
    const { decryptSecret } = await import("@/lib/totp");
    const secret = decryptSecret(user.mfaSecret);
    const valid = verifyTotp(secret, code);

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid code. Please try again." },
        { status: 400 },
      );
    }

    // Generate backup codes
    const { codes, hashes } = generateBackupCodes();

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabledAt: new Date(),
        mfaBackupCodes: hashes,
      },
    });

    logAuditEvent({
      action: "user.mfa_enabled",
      actorId: userId,
      actorEmail: user.email,
      targetId: userId,
      targetType: "User",
    }, req);

    return NextResponse.json({
      enabled: true,
      backupCodes: codes,
      message: "MFA has been enabled. Save your backup codes — they won't be shown again.",
    });
  }

  // Step 1: Generate secret
  if (user.mfaEnabledAt) {
    return NextResponse.json(
      { error: "MFA is already enabled. Disable it first to re-setup." },
      { status: 400 },
    );
  }

  const { secret, encryptedSecret } = generateSecret();
  const otpauthUri = generateTotpUri(secret, user.email);

  // Store encrypted secret (not yet active until verified)
  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: encryptedSecret, mfaEnabledAt: null },
  });

  return NextResponse.json({
    otpauthUri,
    message: "Scan this QR code with your authenticator app, then submit a code to verify.",
  });
});
