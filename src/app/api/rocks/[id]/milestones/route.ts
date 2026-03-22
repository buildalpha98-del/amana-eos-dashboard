import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const createMilestoneSchema = z.object({
  title: z.string().min(1, "Title is required"),
  dueDate: z.string().min(1, "Due date is required"),
});

// POST /api/rocks/:id/milestones — add a milestone to a rock
export const POST = withApiAuth(async (req, session, context) => {
const { id: rockId } = await context!.params!;
  const body = await req.json();
  const parsed = createMilestoneSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const rock = await prisma.rock.findUnique({ where: { id: rockId } });
  if (!rock || rock.deleted) {
    return NextResponse.json({ error: "Rock not found" }, { status: 404 });
  }

  const milestone = await prisma.milestone.create({
    data: {
      title: parsed.data.title,
      dueDate: new Date(parsed.data.dueDate),
      rockId,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Milestone",
      entityId: milestone.id,
      details: { title: milestone.title, rockId },
    },
  });

  return NextResponse.json(milestone, { status: 201 });
});
