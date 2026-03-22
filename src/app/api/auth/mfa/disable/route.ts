import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { logAuditEvent } from "@/lib/audit-log";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const bodySchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * POST /api/auth/mfa/disable
 *
 * Disable MFA for the current user. Requires password confirmation.
 *
 * Body: { password: string }
 */
export const POST = withApiAuth(async (req, session) => {
const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { password } = parsed.data;

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
});
