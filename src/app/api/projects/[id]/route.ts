import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "complete", "on_hold", "cancelled"]).optional(),
  ownerId: z.string().nullable().optional(),
  serviceId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
});

// GET /api/projects/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
      template: { select: { id: true, name: true } },
      todos: {
        where: { deleted: false },
        include: {
          assignee: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

// PATCH /api/projects/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.ownerId !== undefined) data.ownerId = parsed.data.ownerId;
  if (parsed.data.serviceId !== undefined) data.serviceId = parsed.data.serviceId;
  if (parsed.data.startDate !== undefined) data.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  if (parsed.data.targetDate !== undefined) data.targetDate = parsed.data.targetDate ? new Date(parsed.data.targetDate) : null;

  // Auto-set completedAt when status changes to complete
  if (parsed.data.status === "complete") {
    data.completedAt = new Date();
  } else if (parsed.data.status) {
    data.completedAt = null;
  }

  const project = await prisma.project.update({
    where: { id },
    data,
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Project",
      entityId: project.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(project);
}

// DELETE /api/projects/[id] - soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  await prisma.project.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Project",
      entityId: id,
      details: {},
    },
  });

  return NextResponse.json({ success: true });
}
