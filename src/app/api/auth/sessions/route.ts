import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logins = await prisma.securityAuditLog.findMany({
    where: { actorId: session.user.id, action: "user.login" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, ip: true, userAgent: true, createdAt: true },
  });

  return NextResponse.json({ sessions: logins });
}
