/**
 * POST /api/auth/set-password — choose your own password after signing in
 * with one someone else picked (the welcome email's temporary password, or
 * an admin reset). Only callable while `User.mustChangePassword` is true:
 * that is what lets it skip the current-password check — the user proved
 * the temporary password seconds ago at sign-in, and asking for it again
 * on a phone is exactly the friction this flow exists to remove. Anyone
 * changing a password they chose themselves uses /api/auth/change-password.
 *
 * Bumps tokenVersion (ends every other session on the old password); the
 * page signs straight back in with the new one so the user isn't bounced
 * to /login.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { passwordSchema } from "@/lib/schemas/auth";
import { checkPasswordBreach } from "@/lib/password-breach-check";
import { logAuditEvent } from "@/lib/audit-log";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

export const POST = withApiAuth(
  async (req, session) => {
    const { newPassword } = (await parseJsonBody(req)) as { newPassword?: unknown };
    if (typeof newPassword !== "string" || !newPassword) {
      throw ApiError.badRequest("Please enter a new password");
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true, mustChangePassword: true },
    });
    if (!user) throw ApiError.notFound("User not found");
    if (!user.mustChangePassword) {
      throw new ApiError(409, "Your password is already set. Change it from your profile instead.");
    }

    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    // Re-using the temporary password defeats the point.
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw ApiError.badRequest("Please choose a different password from the temporary one");
    }

    const breachCount = await checkPasswordBreach(newPassword);
    if (breachCount > 0) {
      throw ApiError.badRequest(
        `This password has appeared in ${breachCount.toLocaleString()} data breaches. Please choose a different one.`,
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });

    logAuditEvent(
      {
        action: "user.password_set_first_login",
        actorId: session.user.id,
        actorEmail: session.user.email,
        targetId: session.user.id,
        targetType: "User",
      },
      req,
    );

    return NextResponse.json({ ok: true });
  },
  { rateLimit: { max: 10, windowMs: 15 * 60 * 1000 } },
);
