import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

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

  const data: Record<string, unknown> = {};
  const fields = [
    "name", "description", "status", "ownerId", "serviceId",
    "startDate", "targetDate",
  ];

  for (const f of fields) {
    if (body[f] !== undefined) {
      if ((f === "startDate" || f === "targetDate") && body[f]) {
        data[f] = new Date(body[f]);
      } else {
        data[f] = body[f];
      }
    }
  }

  // Auto-set completedAt when status changes to complete
  if (body.status === "complete") {
    data.completedAt = new Date();
  } else if (body.status && body.status !== "complete") {
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
