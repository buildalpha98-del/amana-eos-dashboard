import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const createMeetingSchema = z.object({
  title: z.string().min(1, "Title is required"),
  date: z.string().min(1, "Date is required"),
  serviceIds: z.array(z.string()).optional(),
  attendeeIds: z.array(z.string()).optional(),
});

// GET /api/meetings — list meetings ordered by date desc
export const GET = withApiAuth(async (req, session) => {
const scope = getServiceScope(session);
  const stateScope = getStateScope(session);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  // State Manager: pre-fetch service IDs in their state to filter meetings
  let stateServiceIds: string[] | null = null;
  if (stateScope) {
    const stateServices = await prisma.service.findMany({
      where: { state: stateScope },
      select: { id: true },
    });
    stateServiceIds = stateServices.map((s) => s.id);
  }

  const meetings = await prisma.meeting.findMany({
    where: {
      ...(status ? { status: status as "scheduled" | "in_progress" | "completed" | "cancelled" } : {}),
      // Member/staff: only see meetings linked to their service
      ...(scope ? { serviceIds: { has: scope } } : {}),
      // State Manager: only see meetings linked to services in their state
      ...(stateServiceIds ? { serviceIds: { hasSome: stateServiceIds } } : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatar: true } },
      attendees: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" as const },
      },
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  return NextResponse.json(meetings);
});

// POST /api/meetings — create a new meeting
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
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
      attendees: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" as const },
      },
    },
  });

  if (parsed.data.attendeeIds?.length) {
    await prisma.meetingAttendee.createMany({
      data: parsed.data.attendeeIds.map((userId: string) => ({
        meetingId: meeting.id,
        userId,
        status: "present" as const,
      })),
    });
  }

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
}, { roles: ["owner", "head_office", "admin"] });
