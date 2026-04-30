import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const updateGoalSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["on_track", "at_risk", "off_track", "complete"]).optional(),
  targetDate: z.string().nullable().optional(),
});

// PATCH /api/goals/[id]
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
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
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/goals/[id]
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

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
}, { roles: ["owner", "head_office", "admin"] });
