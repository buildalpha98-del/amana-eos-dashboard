import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const createCascadeSchema = z.object({
  meetingId: z.string().min(1, "Meeting ID is required"),
  message: z.string().min(1, "Message is required"),
});

// GET /api/communication/cascade — list cascade messages
export const GET = withApiAuth(async (req, session) => {
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
});

// POST /api/communication/cascade — publish a cascade message from a meeting
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
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
}, { roles: ["owner", "head_office", "admin"] });
