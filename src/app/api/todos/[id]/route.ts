import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendAssignmentEmail } from "@/lib/send-assignment-email";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const updateTodoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assigneeId: z.string().optional(),
  status: z.enum(["pending", "in_progress", "complete", "cancelled"]).optional(),
  dueDate: z.string().optional(),
  weekOf: z.string().optional(),
  rockId: z.string().nullable().optional(),
  issueId: z.string().nullable().optional(),
  isPrivate: z.boolean().optional(),
});

// GET /api/todos/[id]
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const todo = await prisma.todo.findUnique({
    where: { id, deleted: false },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      issue: { select: { id: true, title: true } },
    },
  });

  if (!todo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  return NextResponse.json(todo);
});

// PATCH /api/todos/[id]
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateTodoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const existing = await prisma.todo.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.assigneeId !== undefined) data.assigneeId = parsed.data.assigneeId;
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    if (parsed.data.status === "complete") {
      data.completedAt = new Date();
    } else {
      data.completedAt = null;
    }
  }
  if (parsed.data.dueDate !== undefined) data.dueDate = new Date(parsed.data.dueDate);
  if (parsed.data.weekOf !== undefined) data.weekOf = new Date(parsed.data.weekOf);
  if (parsed.data.rockId !== undefined) data.rockId = parsed.data.rockId || null;
  if (parsed.data.issueId !== undefined) data.issueId = parsed.data.issueId || null;
  if (parsed.data.isPrivate !== undefined) data.isPrivate = parsed.data.isPrivate;

  const todo = await prisma.todo.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      issue: { select: { id: true, title: true } },
    },
  });

  // Auto-update rock progress when a linked todo status changes
  if (parsed.data.status !== undefined && todo.rockId) {
    const linkedTodos = await prisma.todo.findMany({
      where: { rockId: todo.rockId, deleted: false },
      select: { status: true },
    });
    const total = linkedTodos.length;
    const completed = linkedTodos.filter((t) => t.status === "complete").length;
    const newPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    await prisma.rock.update({
      where: { id: todo.rockId },
      data: { percentComplete: newPercent },
    });
  }

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Todo",
      entityId: todo.id,
      details: { changes: Object.keys(data) },
    },
  });

  // Notify new assignee if assigneeId changed and it's not the current user
  if (
    parsed.data.assigneeId !== undefined &&
    parsed.data.assigneeId !== existing.assigneeId &&
    parsed.data.assigneeId !== session!.user.id
  ) {
    sendAssignmentEmail({
      type: "todo",
      assigneeId: parsed.data.assigneeId,
      assignerId: session!.user.id,
      entityTitle: todo.title,
    });
  }

  return NextResponse.json(todo);
});

// DELETE /api/todos/[id] — soft delete
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const todo = await prisma.todo.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Todo",
      entityId: todo.id,
    },
  });

  return NextResponse.json({ success: true });
});
