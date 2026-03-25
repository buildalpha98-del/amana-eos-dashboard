import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import { checkRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import crypto from "crypto";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email("Valid email is required"),
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Email is required");
  }
  const { email } = parsed.data;

  // Rate limit: 5 reset requests per 15 minutes per email
  const rl = await checkRateLimit(`pwd-reset:${email.toLowerCase().trim()}`);
  if (rl.limited) {
    throw new ApiError(429, "Too many requests. Please try again later.");
  }

  // Always return success to prevent email enumeration
  const successResponse = NextResponse.json({
    message:
      "If an account with that email exists, a password reset link has been sent.",
  });

  // Look up the user
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || !user.active) {
    // Don't reveal whether user exists
    return successResponse;
  }

  // Invalidate any existing unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  // Generate a secure random token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  // Build the reset URL
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  // Send the email
  const { subject, html } = passwordResetEmail(
    user.name.split(" ")[0],
    resetUrl
  );

  const resend = getResend();
  if (resend) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject,
      html,
    });
  } else {
    // Dev fallback: log the reset URL
    if (process.env.NODE_ENV !== "production") console.log(`[DEV] Password reset link for ${user.email}: ${resetUrl}`);
  }

  return successResponse;
});
