import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

export const POST = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const notif = await prisma.userNotification.findUnique({ where: { id } });
  if (!notif) throw ApiError.notFound("Notification not found");
  if (notif.userId !== session.user.id) throw ApiError.forbidden();

  const updated = await prisma.userNotification.update({
    where: { id },
    data: { read: true, readAt: new Date() },
  });
  return NextResponse.json({ notification: updated });
});
