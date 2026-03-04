import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createMeetingSchema = z.object({
  title: z.string().min(1, "Title is required"),
  date: z.string().min(1, "Date is required"),
  serviceIds: z.array(z.string()).optional(),
});

// GET /api/meetings — list meetings ordered by date desc
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const meetings = await prisma.meeting.findMany({
    where: {
      ...(status ? { status: status as "scheduled" | "in_progress" | "completed" | "cancelled" } : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatar: true } },
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  return NextResponse.json(meetings);
}

// POST /api/meetings — create a new meeting
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createMeetingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const meeting = await prisma.meeting.create({
    data: {
      title: parsed.data.title,
      date: new Date(parsed.data.date),
      status: "in_progress",
      startedAt: new Date(),
      createdById: session!.user.id,
      serviceIds: parsed.data.serviceIds || [],
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Meeting",
      entityId: meeting.id,
      details: { title: meeting.title, serviceIds: parsed.data.serviceIds },
    },
  });

  return NextResponse.json(meeting, { status: 201 });
}
