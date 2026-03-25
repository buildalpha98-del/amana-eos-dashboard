import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { passwordSchema } from "@/lib/schemas/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkPasswordBreach } from "@/lib/password-breach-check";
import { logAuditEvent } from "@/lib/audit-log";
import { withApiHandler } from "@/lib/api-handler";
import { parseJsonBody } from "@/lib/api-error";

export const POST = withApiHandler(async (req) => {
    // Rate limit: 5 attempts per 15 minutes per IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit(`pwd-reset-attempt:${ip}`);
    if (rl.limited) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }

    const body = await parseJsonBody(req);
    const { token, password } = body as { token: string; password: string };

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Reset token is required" },
        { status: 400 }
      );
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      return NextResponse.json(
        { error: passwordResult.error.issues[0].message },
        { status: 400 }
      );
    }

    // Check if password has appeared in known data breaches
    const breachCount = await checkPasswordBreach(password);
    if (breachCount > 0) {
      return NextResponse.json(
        { error: `This password has appeared in ${breachCount.toLocaleString()} data breaches. Please choose a different password.` },
        { status: 400 },
      );
    }

    // Look up the token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    if (resetToken.used) {
      return NextResponse.json(
        { error: "This reset link has already been used" },
        { status: 400 }
      );
    }

    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This reset link has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Hash the new password and update
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    logAuditEvent({
      action: "user.password_reset",
      actorId: resetToken.userId,
      actorEmail: resetToken.user.email,
      targetId: resetToken.userId,
      targetType: "User",
    }, req);

    return NextResponse.json({
      message: "Password has been reset successfully. You can now sign in.",
    });
  });

// GET: Validate that a token is still valid (used by the reset page)
export const GET = withApiHandler(async (req) => {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { valid: false, error: "Token is required" },
      { status: 400 }
    );
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!resetToken) {
    return NextResponse.json({ valid: false, error: "This reset link is invalid. Please request a new one." });
  }

  if (resetToken.used) {
    return NextResponse.json({ valid: false, error: "This reset link has already been used. Please request a new one." });
  }

  if (resetToken.expiresAt < new Date()) {
    return NextResponse.json({ valid: false, error: "This reset link has expired. Please request a new one." });
  }

  return NextResponse.json({ valid: true });
});
