import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { compare } from "bcryptjs";
import { logAuditEvent } from "@/lib/audit-log";

/**
 * POST /api/auth/mfa/disable
 *
 * Disable MFA for the current user. Requires password confirmation.
 *
 * Body: { password: string }
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { password } = await req.json();
  if (!password) {
    return NextResponse.json(
      { error: "Password is required to disable MFA" },
      { status: 400 },
    );
  }

  const userId = session!.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, mfaEnabledAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.mfaEnabledAt) {
    return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
  }

  const isValid = await compare(password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaSecret: null,
      mfaBackupCodes: [],
      mfaEnabledAt: null,
    },
  });

  logAuditEvent({
    action: "user.mfa_disabled",
    actorId: userId,
    actorEmail: user.email,
    targetId: userId,
    targetType: "User",
  }, req);

  return NextResponse.json({ message: "MFA has been disabled." });
}
