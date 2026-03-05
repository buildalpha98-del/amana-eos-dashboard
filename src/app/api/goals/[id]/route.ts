import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateGoalSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["on_track", "at_risk", "off_track", "complete"]).optional(),
  targetDate: z.string().nullable().optional(),
});

// PATCH /api/goals/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.targetDate !== undefined) data.targetDate = parsed.data.targetDate ? new Date(parsed.data.targetDate) : null;

  const goal = await prisma.oneYearGoal.update({
    where: { id },
    data,
    include: {
      rocks: {
        where: { deleted: false },
        select: { id: true, title: true, status: true, percentComplete: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "OneYearGoal",
      entityId: goal.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(goal);
}

// DELETE /api/goals/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  await prisma.oneYearGoal.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "OneYearGoal",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
