import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

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

  const existing = await prisma.issue.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.ownerId !== undefined) data.ownerId = body.ownerId || null;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.rockId !== undefined) data.rockId = body.rockId || null;
  if (body.resolution !== undefined) data.resolution = body.resolution;

  if (body.status !== undefined) {
    data.status = body.status;
    // Track IDS timestamps
    if (body.status === "in_discussion" && !existing.discussedAt) {
      data.discussedAt = new Date();
    }
    if (body.status === "solved" && !existing.solvedAt) {
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
