import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const unread = searchParams.get("unread") === "true";

  const notifications = await prisma.userNotification.findMany({
    where: { userId: session.user.id, ...(unread ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ notifications });
});
