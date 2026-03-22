import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  serviceId: z.string().nullable().optional(),
  recurrence: z.string().optional(),
  nextRunAt: z.string().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/todo-templates/[id] — update a template
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const existing = await prisma.todoTemplate.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.assigneeId !== undefined) data.assigneeId = parsed.data.assigneeId;
  if (parsed.data.serviceId !== undefined) data.serviceId = parsed.data.serviceId || null;
  if (parsed.data.recurrence !== undefined) data.recurrence = parsed.data.recurrence;
  if (parsed.data.nextRunAt !== undefined) data.nextRunAt = new Date(parsed.data.nextRunAt);
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  const template = await prisma.todoTemplate.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "TodoTemplate",
      entityId: template.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(template);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/todo-templates/[id] — soft delete (set isActive=false)
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const existing = await prisma.todoTemplate.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  await prisma.todoTemplate.update({
    where: { id },
    data: { isActive: false },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "TodoTemplate",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
