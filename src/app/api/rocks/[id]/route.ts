import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateRockSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  ownerId: z.string().optional(),
  status: z.enum(["on_track", "off_track", "complete", "dropped"]).optional(),
  percentComplete: z.number().min(0).max(100).optional(),
  priority: z.enum(["critical", "high", "medium"]).optional(),
  oneYearGoalId: z.string().optional().nullable(),
});

// GET /api/rocks/:id — get a single rock with all related data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const rock = await prisma.rock.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      oneYearGoal: { select: { id: true, title: true } },
      milestones: { orderBy: { dueDate: "asc" } },
      todos: {
        where: { deleted: false },
        include: {
          assignee: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      issues: {
        where: { deleted: false },
        include: {
          owner: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!rock || rock.deleted) {
    return NextResponse.json({ error: "Rock not found" }, { status: 404 });
  }

  return NextResponse.json(rock);
}

// PATCH /api/rocks/:id — update a rock
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateRockSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.rock.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Rock not found" }, { status: 404 });
  }

  const rock = await prisma.rock.update({
    where: { id },
    data: parsed.data,
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      oneYearGoal: { select: { id: true, title: true } },
      _count: {
        select: {
          todos: { where: { deleted: false } },
          issues: { where: { deleted: false } },
          milestones: true,
        },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Rock",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(rock);
}

// DELETE /api/rocks/:id — soft delete a rock
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.rock.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Rock not found" }, { status: 404 });
  }

  await prisma.rock.update({ where: { id }, data: { deleted: true } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Rock",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
