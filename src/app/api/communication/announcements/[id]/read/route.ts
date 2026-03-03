import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// POST /api/communication/announcements/[id]/read — mark announcement as read
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

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
}
