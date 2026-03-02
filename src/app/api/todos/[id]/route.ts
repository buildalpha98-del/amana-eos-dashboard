import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/todos/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

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
}

// PATCH /api/todos/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.todo.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
  if (body.status !== undefined) {
    data.status = body.status;
    if (body.status === "complete") {
      data.completedAt = new Date();
    } else {
      data.completedAt = null;
    }
  }
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);
  if (body.weekOf !== undefined) data.weekOf = new Date(body.weekOf);
  if (body.rockId !== undefined) data.rockId = body.rockId || null;
  if (body.issueId !== undefined) data.issueId = body.issueId || null;

  const todo = await prisma.todo.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      issue: { select: { id: true, title: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Todo",
      entityId: todo.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(todo);
}

// DELETE /api/todos/[id] — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

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
}
