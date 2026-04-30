import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const updateSchema = z.object({
  day: z.enum(WEEK_DAYS).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  staffName: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  mtopOutcomes: z.array(z.number().int().min(1).max(5)).optional(),
  programmeBrand: z.string().max(50).optional().nullable(),
});

// PATCH /api/services/[id]/programs/[activityId]
export const PATCH = withApiAuth(
  async (req, session, context) => {
const { id, activityId } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.programActivity.findFirst({
    where: { id: activityId, serviceId: id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (data.day !== undefined) updateData.day = data.day;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.staffName !== undefined) updateData.staffName = data.staffName;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.mtopOutcomes !== undefined) updateData.mtopOutcomes = data.mtopOutcomes;
  if (data.programmeBrand !== undefined) updateData.programmeBrand = data.programmeBrand;

  const activity = await prisma.programActivity.update({
    where: { id: activityId },
    data: updateData,
    include: { createdBy: { select: { id: true, name: true } } },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "ProgramActivity",
      entityId: activityId,
      details: { serviceId: id, changes: Object.keys(updateData) },
    },
  });

  return NextResponse.json(activity);
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);

// DELETE /api/services/[id]/programs/[activityId]
export const DELETE = withApiAuth(
  async (req, session, context) => {
const { id, activityId } = await context!.params!;

  const existing = await prisma.programActivity.findFirst({
    where: { id: activityId, serviceId: id },
    select: { id: true, title: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "ProgramActivity",
      entityId: activityId,
      details: { serviceId: id, title: existing.title },
    },
  });

  await prisma.programActivity.delete({ where: { id: activityId } });

  return NextResponse.json({ success: true });
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);
