import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/services/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const service = await prisma.service.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, name: true, email: true, avatar: true } },
      todos: {
        where: { deleted: false },
        include: {
          assignee: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        take: 50,
      },
      issues: {
        where: { deleted: false },
        include: {
          owner: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 20,
      },
      projects: {
        where: { deleted: false },
        include: {
          owner: { select: { id: true, name: true } },
          _count: { select: { todos: { where: { deleted: false } } } },
        },
        orderBy: { createdAt: "desc" },
      },
      rocks: {
        where: { deleted: false },
        include: {
          owner: { select: { id: true, name: true } },
          _count: {
            select: {
              todos: { where: { deleted: false } },
              milestones: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      },
      _count: {
        select: {
          todos: { where: { deleted: false } },
          issues: { where: { deleted: false } },
          projects: { where: { deleted: false } },
          rocks: { where: { deleted: false } },
          measurables: true,
        },
      },
    },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  return NextResponse.json(service);
}

// PATCH /api/services/[id]
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
    "name", "code", "address", "suburb", "state", "postcode",
    "phone", "email", "status", "managerId", "capacity", "operatingDays", "notes",
    "bscDailyRate", "ascDailyRate", "vcDailyRate",
    "bscCasualRate", "ascCasualRate",
    "bscGroceryRate", "ascGroceryRate", "vcGroceryRate",
  ];

  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }

  const service = await prisma.service.update({
    where: { id },
    data,
    include: {
      manager: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Service",
      entityId: service.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(service);
}

// DELETE /api/services/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true, name: true },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Log before deletion
  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Service",
      entityId: service.id,
      details: { name: service.name },
    },
  });

  // Cascade config in schema handles related data
  await prisma.service.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
