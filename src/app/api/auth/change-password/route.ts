import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { passwordSchema } from "@/lib/schemas/auth";
import { checkPasswordBreach } from "@/lib/password-breach-check";
import { logAuditEvent } from "@/lib/audit-log";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
export const POST = withApiAuth(async (req, session) => {
  const { currentPassword, newPassword } = (await parseJsonBody(req)) as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current password and new password are required" },
      { status: 400 },
    );
  }

  // Fetch the user's current password hash
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 400 },
    );
  }

  // Validate new password against schema
  const passwordResult = passwordSchema.safeParse(newPassword);
  if (!passwordResult.success) {
    return NextResponse.json(
      { error: passwordResult.error.issues[0].message },
      { status: 400 },
    );
  }

  // Check if password has appeared in known data breaches
  const breachCount = await checkPasswordBreach(newPassword);
  if (breachCount > 0) {
    return NextResponse.json(
      {
        error: `This password has appeared in ${breachCount.toLocaleString()} data breaches. Please choose a different password.`,
      },
      { status: 400 },
    );
  }

  // Hash and update
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  logAuditEvent(
    {
      action: "user.password_change",
      actorId: session.user.id,
      actorEmail: (session.user as any).email,
      targetId: session.user.id,
      targetType: "User",
    },
    req,
  );

  return NextResponse.json({
    message: "Password changed successfully",
  });
});
