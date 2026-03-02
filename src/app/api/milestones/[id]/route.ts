import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// PATCH /api/milestones/:id — toggle completed or update
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const milestone = await prisma.milestone.findUnique({ where: { id } });
  if (!milestone) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.completed === "boolean") data.completed = body.completed;
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.dueDate === "string") data.dueDate = new Date(body.dueDate);

  const updated = await prisma.milestone.update({ where: { id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/milestones/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const milestone = await prisma.milestone.findUnique({ where: { id } });
  if (!milestone) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }

  await prisma.milestone.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Milestone",
      entityId: id,
      details: { title: milestone.title },
    },
  });

  return NextResponse.json({ success: true });
}
