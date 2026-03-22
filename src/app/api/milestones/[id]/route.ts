import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const patchSchema = z.object({
  completed: z.boolean().optional(),
  title: z.string().min(1).optional(),
  dueDate: z.string().optional(),
});

// PATCH /api/milestones/:id — toggle completed or update
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const milestone = await prisma.milestone.findUnique({ where: { id } });
  if (!milestone) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.completed !== undefined) data.completed = parsed.data.completed;
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.dueDate !== undefined) data.dueDate = new Date(parsed.data.dueDate);

  const updated = await prisma.milestone.update({ where: { id }, data });
  return NextResponse.json(updated);
});

// DELETE /api/milestones/:id
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

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
});
