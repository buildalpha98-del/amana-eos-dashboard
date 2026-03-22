import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendAssignmentEmail } from "@/lib/send-assignment-email";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const updateRockSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  ownerId: z.string().optional(),
  status: z.enum(["on_track", "off_track", "complete", "dropped"]).optional(),
  percentComplete: z.number().min(0).max(100).optional(),
  priority: z.enum(["critical", "high", "medium"]).optional(),
  rockType: z.enum(["company", "personal"]).optional(),
  oneYearGoalId: z.string().optional().nullable(),
});

// GET /api/rocks/:id — get a single rock with all related data
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

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
});

// PATCH /api/rocks/:id — update a rock
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
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

  // Auto-set status to "complete" when progress hits 100%, or revert if lowered
  const updateData = { ...parsed.data };
  if (updateData.percentComplete === 100 && !updateData.status && existing.status !== "complete") {
    updateData.status = "complete";
  } else if (
    updateData.percentComplete !== undefined &&
    updateData.percentComplete < 100 &&
    !updateData.status &&
    existing.status === "complete"
  ) {
    updateData.status = "on_track";
  }

  const rock = await prisma.rock.update({
    where: { id },
    data: updateData,
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

  // Notify new owner if ownerId changed and it's not the current user
  if (
    parsed.data.ownerId !== undefined &&
    parsed.data.ownerId !== existing.ownerId &&
    parsed.data.ownerId !== session!.user.id
  ) {
    sendAssignmentEmail({
      type: "rock",
      assigneeId: parsed.data.ownerId,
      assignerId: session!.user.id,
      entityTitle: rock.title,
    });
  }

  return NextResponse.json(rock);
});

// DELETE /api/rocks/:id — soft delete a rock
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

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
}, { roles: ["owner", "head_office", "admin"] });
