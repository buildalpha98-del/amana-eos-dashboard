import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const mtopOutcomesSchema = z.array(z.number().int().min(1).max(5)).optional();

const activitySchema = z.object({
  weekStart: z.string(),
  day: z.enum(WEEK_DAYS),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  staffName: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  mtopOutcomes: mtopOutcomesSchema,
  programmeBrand: z.string().max(50).optional(),
});

const bulkSchema = z.object({
  weekStart: z.string(),
  activities: z.array(
    z.object({
      day: z.enum(WEEK_DAYS),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      title: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      staffName: z.string().max(100).optional(),
      location: z.string().max(200).optional(),
      notes: z.string().max(500).optional(),
      mtopOutcomes: mtopOutcomesSchema,
      programmeBrand: z.string().max(50).optional(),
    })
  ),
});

// GET /api/services/[id]/programs?weekStart=YYYY-MM-DD
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const url = new URL(req.url);
  const weekStartParam = url.searchParams.get("weekStart");

  // Default to current week Monday
  let weekStart: Date;
  if (weekStartParam) {
    weekStart = new Date(weekStartParam);
  } else {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    weekStart = new Date(now);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);
  }

  const activities = await prisma.programActivity.findMany({
    where: {
      serviceId: id,
      weekStart,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json(activities);
});

// POST /api/services/[id]/programs — create single activity
export const POST = withApiAuth(
  async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = activitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const activity = await prisma.programActivity.create({
    data: {
      serviceId: id,
      weekStart: new Date(data.weekStart),
      day: data.day,
      startTime: data.startTime,
      endTime: data.endTime,
      title: data.title,
      description: data.description || null,
      staffName: data.staffName || null,
      location: data.location || null,
      notes: data.notes || null,
      mtopOutcomes: data.mtopOutcomes || [],
      programmeBrand: data.programmeBrand || null,
      createdById: session!.user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "ProgramActivity",
      entityId: activity.id,
      details: { serviceId: id, title: data.title, day: data.day },
    },
  });

  return NextResponse.json(activity, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);

// PUT /api/services/[id]/programs — bulk upsert (replace all for a week)
export const PUT = withApiAuth(
  async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = bulkSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { weekStart, activities } = parsed.data;
  const weekDate = new Date(weekStart);

  const result = await prisma.$transaction(async (tx) => {
    // Delete existing activities for this week
    await tx.programActivity.deleteMany({
      where: { serviceId: id, weekStart: weekDate },
    });

    // Create new activities
    if (activities.length > 0) {
      await tx.programActivity.createMany({
        data: activities.map((a) => ({
          serviceId: id,
          weekStart: weekDate,
          day: a.day,
          startTime: a.startTime,
          endTime: a.endTime,
          title: a.title,
          description: a.description || null,
          staffName: a.staffName || null,
          location: a.location || null,
          notes: a.notes || null,
          mtopOutcomes: a.mtopOutcomes || [],
          programmeBrand: a.programmeBrand || null,
          createdById: session!.user.id,
        })),
      });
    }

    return tx.programActivity.findMany({
      where: { serviceId: id, weekStart: weekDate },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    });
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "ProgramActivity",
      entityId: id,
      details: { serviceId: id, weekStart, count: activities.length, action: "bulk_upsert" },
    },
  });

  return NextResponse.json(result);
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);
