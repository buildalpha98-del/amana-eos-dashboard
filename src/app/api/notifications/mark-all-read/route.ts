import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const POST = withApiAuth(async (_req, session) => {
  const result = await prisma.userNotification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  return NextResponse.json({ updated: result.count });
});
