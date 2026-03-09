import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// PATCH /api/todo-templates/[id] — update a template
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.todoTemplate.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
  if (body.serviceId !== undefined) data.serviceId = body.serviceId || null;
  if (body.recurrence !== undefined) data.recurrence = body.recurrence;
  if (body.nextRunAt !== undefined) data.nextRunAt = new Date(body.nextRunAt);
  if (body.isActive !== undefined) data.isActive = body.isActive;

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
}

// DELETE /api/todo-templates/[id] — soft delete (set isActive=false)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

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
}
