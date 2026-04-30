import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const GET = withApiAuth(async (_req, session) => {
  const count = await prisma.userNotification.count({
    where: { userId: session.user.id, read: false },
  });
  return NextResponse.json({ count });
});
