import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// POST /api/communication/announcements/[id]/read — mark announcement as read
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const announcement = await prisma.announcement.findUnique({
    where: { id, deleted: false },
  });

  if (!announcement) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  await prisma.announcementRead.upsert({
    where: {
      announcementId_userId: {
        announcementId: id,
        userId: session!.user.id,
      },
    },
    create: {
      announcementId: id,
      userId: session!.user.id,
    },
    update: {},
  });

  return NextResponse.json({ success: true });
});
