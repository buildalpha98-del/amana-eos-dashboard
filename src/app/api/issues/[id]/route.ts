import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { sendAssignmentEmail } from "@/lib/send-assignment-email";

const updateIssueSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  rockId: z.string().nullable().optional(),
  status: z.enum(["open", "in_discussion", "solved", "closed"]).optional(),
  resolution: z.string().nullable().optional(),
});

// GET /api/issues/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const issue = await prisma.issue.findUnique({
    where: { id, deleted: false },
    include: {
      raisedBy: { select: { id: true, name: true, email: true, avatar: true } },
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      spawnedTodos: {
        where: { deleted: false },
        include: {
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  return NextResponse.json(issue);
}

// PATCH /api/issues/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const existing = await prisma.issue.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.ownerId !== undefined) data.ownerId = parsed.data.ownerId || null;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.rockId !== undefined) data.rockId = parsed.data.rockId || null;
  if (parsed.data.resolution !== undefined) data.resolution = parsed.data.resolution;

  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    // Track IDS timestamps
    if (parsed.data.status === "in_discussion" && !existing.discussedAt) {
      data.discussedAt = new Date();
    }
    if (parsed.data.status === "solved" && !existing.solvedAt) {
      data.solvedAt = new Date();
    }
  }

  const issue = await prisma.issue.update({
    where: { id },
    data,
    include: {
      raisedBy: { select: { id: true, name: true, email: true, avatar: true } },
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      _count: {
        select: { spawnedTodos: { where: { deleted: false } } },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Issue",
      entityId: issue.id,
      details: { changes: Object.keys(data) },
    },
  });

  // Notify new owner if ownerId changed and it's not the current user
  if (
    parsed.data.ownerId !== undefined &&
    parsed.data.ownerId !== existing.ownerId &&
    parsed.data.ownerId !== null &&
    parsed.data.ownerId !== session!.user.id
  ) {
    sendAssignmentEmail({
      type: "issue",
      assigneeId: parsed.data.ownerId,
      assignerId: session!.user.id,
      entityTitle: issue.title,
    });
  }

  return NextResponse.json(issue);
}

// DELETE /api/issues/[id] — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const issue = await prisma.issue.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Issue",
      entityId: issue.id,
    },
  });

  return NextResponse.json({ success: true });
}
