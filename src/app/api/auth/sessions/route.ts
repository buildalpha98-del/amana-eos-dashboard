import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
  const logins = await prisma.securityAuditLog.findMany({
    where: { actorId: session.user.id, action: "user.login" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, ip: true, userAgent: true, createdAt: true },
  });

  return NextResponse.json({ sessions: logins });
});
