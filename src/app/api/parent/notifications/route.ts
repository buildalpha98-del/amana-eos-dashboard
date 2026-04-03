import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/api-error";
import { z } from "zod";

// GET /api/parent/notifications — fetch recent notifications
export const GET = withParentAuth(async (req, { parent }) => {
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";

  const notifications = await prisma.parentNotification.findMany({
    where: {
      parentEmail: parent.email.toLowerCase(),
      ...(unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const unreadCount = await prisma.parentNotification.count({
    where: { parentEmail: parent.email.toLowerCase(), read: false },
  });

  return NextResponse.json({ notifications, unreadCount });
});

// PATCH /api/parent/notifications — mark notifications as read
const patchSchema = z.object({
  notificationIds: z.array(z.string().min(1)).min(1).max(50).optional(),
  markAllRead: z.boolean().optional(),
});

export const PATCH = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const { notificationIds, markAllRead } = parsed.data;

  if (markAllRead) {
    await prisma.parentNotification.updateMany({
      where: { parentEmail: parent.email.toLowerCase(), read: false },
      data: { read: true },
    });
  } else if (notificationIds) {
    await prisma.parentNotification.updateMany({
      where: {
        id: { in: notificationIds },
        parentEmail: parent.email.toLowerCase(),
      },
      data: { read: true },
    });
  }

  return NextResponse.json({ success: true });
});
