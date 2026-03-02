import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  currentSection: z.number().min(0).max(6).optional(),
  rating: z.number().min(1).max(10).optional().nullable(),
  notes: z.string().optional().nullable(),
  headlines: z.string().optional().nullable(),
  segueNotes: z.string().optional().nullable(),
  concludeNotes: z.string().optional().nullable(),
});

// GET /api/meetings/:id — get a single meeting
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  return NextResponse.json(meeting);
}

// PATCH /api/meetings/:id — update a meeting
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateMeetingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.meeting.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Auto-set completedAt when status changes to completed
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "completed" && !existing.completedAt) {
    updateData.completedAt = new Date();
  }

  const meeting = await prisma.meeting.update({
    where: { id },
    data: updateData,
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Meeting",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(meeting);
}
