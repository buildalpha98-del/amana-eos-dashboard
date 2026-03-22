import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { withApiAuth } from "@/lib/server-auth";

/**
 * POST /api/users/[id]/revoke-sessions
 *
 * Bumps tokenVersion to invalidate all existing JWT sessions for a user.
 * Owner/admin can revoke anyone; users can revoke their own sessions.
 */
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  // Users can revoke their own sessions; owners/admins can revoke anyone
  const isOwn = session!.user.id === id;
  const isPrivileged = session!.user.role === "owner" || session!.user.role === "admin";

  if (!isOwn && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id },
    data: { tokenVersion: { increment: 1 } },
  });

  logAuditEvent({
    action: "user.sessions_revoked",
    actorId: session!.user.id,
    actorEmail: session!.user.email,
    targetId: id,
    targetType: "User",
    metadata: { revokedBy: isOwn ? "self" : "admin" },
  }, req);

  return NextResponse.json({ message: "All sessions have been revoked." });
});
