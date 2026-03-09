import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  audience: z.enum(["all", "owners_admins", "managers", "custom"]).optional(),
  priority: z.enum(["normal", "important", "urgent"]).optional(),
  pinned: z.boolean().optional(),
  serviceId: z.string().optional().nullable(),
  publishedAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

// GET /api/communication/announcements/[id] — single announcement with read receipts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const announcement = await prisma.announcement.findUnique({
    where: { id, deleted: false },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      service: { select: { id: true, name: true } },
      readReceipts: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { readAt: "desc" },
      },
    },
  });

  if (!announcement) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  return NextResponse.json(announcement);
}

// PATCH /api/communication/announcements/[id] — update announcement
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateAnnouncementSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.announcement.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.body !== undefined) data.body = parsed.data.body;
  if (parsed.data.audience !== undefined) data.audience = parsed.data.audience;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.pinned !== undefined) data.pinned = parsed.data.pinned;
  if (parsed.data.serviceId !== undefined) data.serviceId = parsed.data.serviceId || null;
  if (parsed.data.publishedAt !== undefined) {
    data.publishedAt = parsed.data.publishedAt
      ? new Date(parsed.data.publishedAt)
      : null;
  }
  if (parsed.data.expiresAt !== undefined) {
    data.expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : null;
  }

  const announcement = await prisma.announcement.update({
    where: { id },
    data,
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      service: { select: { id: true, name: true } },
      _count: {
        select: { readReceipts: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Announcement",
      entityId: announcement.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(announcement);
}

// DELETE /api/communication/announcements/[id] — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.announcement.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  await prisma.announcement.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Announcement",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
