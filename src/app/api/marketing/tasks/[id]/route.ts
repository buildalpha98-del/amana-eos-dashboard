import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const subtaskSchema = z.object({
  text: z.string().min(1),
  done: z.boolean(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["todo", "in_progress", "in_review", "done"]).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  dueDate: z.coerce.date().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  postId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  subtasks: z.array(subtaskSchema).optional().nullable(),
});

const taskIncludes = {
  assignee: { select: { id: true, name: true, avatar: true } },
  campaign: { select: { id: true, name: true } },
  post: { select: { id: true, title: true } },
  service: { select: { id: true, name: true, code: true } },
} as const;

// GET /api/marketing/tasks/:id
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const task = await prisma.marketingTask.findUnique({
    where: { id },
    include: taskIncludes,
  });

  if (!task || task.deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// PATCH /api/marketing/tasks/:id
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.marketingTask.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { subtasks, ...restData } = parsed.data;
  const task = await prisma.marketingTask.update({
    where: { id },
    data: {
      ...restData,
      ...(subtasks !== undefined ? { subtasks: subtasks as any } : {}),
    },
    include: taskIncludes,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "MarketingTask",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(task);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// DELETE /api/marketing/tasks/:id — soft delete
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const existing = await prisma.marketingTask.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  await prisma.marketingTask.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "MarketingTask",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
