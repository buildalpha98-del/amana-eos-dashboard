import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

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
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

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
}

// PATCH /api/activity-templates/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
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
}

// DELETE /api/activity-templates/[id] — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

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
}
