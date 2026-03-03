import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createCascadeSchema = z.object({
  meetingId: z.string().min(1, "Meeting ID is required"),
  message: z.string().min(1, "Message is required"),
});

// GET /api/communication/cascade — list cascade messages
export async function GET(_req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const messages = await prisma.cascadeMessage.findMany({
    where: { deleted: false },
    include: {
      meeting: { select: { id: true, title: true, date: true } },
      _count: { select: { acknowledgments: true } },
      acknowledgments: {
        where: { userId: session!.user.id },
        select: { id: true, acknowledgedAt: true },
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  return NextResponse.json(messages);
}

// POST /api/communication/cascade — publish a cascade message from a meeting
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createCascadeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const cascade = await prisma.cascadeMessage.create({
    data: {
      meetingId: parsed.data.meetingId,
      message: parsed.data.message,
    },
    include: {
      meeting: { select: { id: true, title: true, date: true } },
      _count: { select: { acknowledgments: true } },
      acknowledgments: {
        where: { userId: session!.user.id },
        select: { id: true, acknowledgedAt: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "CascadeMessage",
      entityId: cascade.id,
      details: { meetingId: parsed.data.meetingId },
    },
  });

  return NextResponse.json(cascade, { status: 201 });
}
