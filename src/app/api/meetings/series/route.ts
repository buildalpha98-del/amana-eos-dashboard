import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

/**
 * Meeting series (execution layer, 2026-08-31): recurring weekly meeting
 * templates. The daily meeting-series cron materialises each active
 * series' next occurrence as a `scheduled` Meeting.
 */

const seriesSchema = z.object({
  name: z.string().min(1, "Name is required"),
  dayOfWeek: z.number().int().min(0).max(6),
  minuteOfDay: z.number().int().min(0).max(1439),
  timezone: z.string().min(1).default("Australia/Sydney"),
  isLeadership: z.boolean().optional(),
  serviceIds: z.array(z.string()).optional(),
  scorecardId: z.string().optional().nullable(),
  attendeeUserIds: z.array(z.string()).optional(),
});

const MEETING_ROLES = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "eos_implementer",
] as const;

// GET /api/meetings/series — list (any authed user; the list drives the
// read-only "Recurring" strip too)
export const GET = withApiAuth(async () => {
  const series = await prisma.meetingSeries.findMany({
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { meetings: true } },
    },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(series);
});

// POST /api/meetings/series — create
export const POST = withApiAuth(
  async (req, session) => {
    const parsed = seriesSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const series = await prisma.meetingSeries.create({
      data: {
        name: parsed.data.name,
        dayOfWeek: parsed.data.dayOfWeek,
        minuteOfDay: parsed.data.minuteOfDay,
        timezone: parsed.data.timezone,
        isLeadership: parsed.data.isLeadership ?? false,
        serviceIds: parsed.data.serviceIds ?? [],
        scorecardId: parsed.data.scorecardId ?? null,
        attendeeUserIds: parsed.data.attendeeUserIds ?? [],
        createdById: session!.user.id,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "create",
        entityType: "MeetingSeries",
        entityId: series.id,
        details: { name: series.name, dayOfWeek: series.dayOfWeek },
      },
    });

    return NextResponse.json(series, { status: 201 });
  },
  { roles: [...MEETING_ROLES] },
);
