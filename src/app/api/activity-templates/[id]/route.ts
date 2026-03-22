import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

const CATEGORIES = [
  "physical_play", "creative_arts", "music_movement", "literacy", "numeracy",
  "nature_outdoors", "cooking_nutrition", "social_emotional", "quiet_time", "free_play", "other",
] as const;

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  howTo: z.string().max(5000).optional().nullable(),
  resourcesNeeded: z.string().max(2000).optional().nullable(),
  category: z.enum(CATEGORIES).optional(),
  ageGroup: z.string().max(50).optional().nullable(),
  durationMinutes: z.number().int().min(1).max(480).optional().nullable(),
});

// GET /api/activity-templates/[id]
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const template = await prisma.activityTemplate.findFirst({
    where: { id, deleted: false },
    include: {
      files: { orderBy: { createdAt: "desc" } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json(template);
});

// PATCH /api/activity-templates/[id]
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.activityTemplate.findFirst({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const template = await prisma.activityTemplate.update({
    where: { id },
    data: parsed.data,
    include: {
      files: { orderBy: { createdAt: "desc" } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "ActivityTemplate",
      entityId: id,
      details: { changes: Object.keys(parsed.data) },
    },
  });

  return NextResponse.json(template);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/activity-templates/[id] — soft delete
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const existing = await prisma.activityTemplate.findFirst({
    where: { id, deleted: false },
    select: { id: true, title: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  await prisma.activityTemplate.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "ActivityTemplate",
      entityId: id,
      details: { title: existing.title },
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
