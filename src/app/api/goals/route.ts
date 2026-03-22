import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const createGoalSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  targetDate: z.string().optional(),
  vtoId: z.string().min(1, "V/TO ID is required"),
});

// POST /api/goals — create a 1-year goal
export const POST = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = createGoalSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const goal = await prisma.oneYearGoal.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
      vtoId: parsed.data.vtoId,
    },
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
      action: "create",
      entityType: "OneYearGoal",
      entityId: goal.id,
      details: { title: goal.title },
    },
  });

  return NextResponse.json(goal, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
