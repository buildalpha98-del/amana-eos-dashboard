import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const assignSchema = z.object({
  userId: z.string().min(1),
  packId: z.string().min(1),
  dueDate: z.string().optional(),
});

const progressSchema = z.object({
  onboardingId: z.string().min(1),
  taskId: z.string().min(1),
  completed: z.boolean(),
  notes: z.string().optional(),
});

// GET /api/onboarding/assign — list assignments (optionally filtered by userId)
export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  // Staff can only see their own assignments
  const targetUserId =
    session!.user.role === "staff" ? session!.user.id : userId;

  const where: Record<string, unknown> = {};
  if (targetUserId) where.userId = targetUserId;

  const assignments = await prisma.staffOnboarding.findMany({
    where: where as any,
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      pack: {
        select: {
          id: true,
          name: true,
          description: true,
          service: { select: { id: true, name: true, code: true } },
          _count: { select: { tasks: true } },
        },
      },
      progress: {
        include: {
          task: { select: { id: true, title: true, category: true, isRequired: true, sortOrder: true } },
        },
        orderBy: { task: { sortOrder: "asc" } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assignments);
});

// POST /api/onboarding/assign — assign a pack to a user OR update task progress
export const POST = withApiAuth(async (req, session) => {
const body = (await parseJsonBody(req)) as Record<string, unknown>;

  // Check if this is a progress update
  if (body.onboardingId && body.taskId !== undefined) {
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Staff can only update their own progress
    if (session!.user.role === "staff") {
      const assignment = await prisma.staffOnboarding.findUnique({
        where: { id: parsed.data.onboardingId },
      });
      if (!assignment || assignment.userId !== session!.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const progress = await prisma.staffOnboardingProgress.upsert({
      where: {
        onboardingId_taskId: {
          onboardingId: parsed.data.onboardingId,
          taskId: parsed.data.taskId,
        },
      },
      update: {
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
        notes: parsed.data.notes,
      },
      create: {
        onboardingId: parsed.data.onboardingId,
        taskId: parsed.data.taskId,
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
        notes: parsed.data.notes,
      },
    });

    // Recalculate overall status
    const assignment = await prisma.staffOnboarding.findUnique({
      where: { id: parsed.data.onboardingId },
      include: {
        pack: { include: { tasks: { where: { isRequired: true } } } },
        progress: true,
      },
    });

    if (assignment) {
      const requiredTaskIds = assignment.pack.tasks.map((t) => t.id);
      const completedRequired = assignment.progress.filter(
        (p) => p.completed && requiredTaskIds.includes(p.taskId)
      ).length;
      const anyStarted = assignment.progress.some((p) => p.completed);
      const allDone = completedRequired >= requiredTaskIds.length;

      await prisma.staffOnboarding.update({
        where: { id: parsed.data.onboardingId },
        data: {
          status: allDone ? "completed" : anyStarted ? "in_progress" : "not_started",
          startedAt: anyStarted && !assignment.startedAt ? new Date() : undefined,
          completedAt: allDone ? new Date() : null,
        },
      });
    }

    return NextResponse.json(progress);
  }

  // Otherwise, assign a pack to a user (owner/admin only)
  if (session!.user.role !== "owner" && session!.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Check if already assigned
  const existing = await prisma.staffOnboarding.findUnique({
    where: {
      userId_packId: {
        userId: parsed.data.userId,
        packId: parsed.data.packId,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This pack is already assigned to this user" },
      { status: 409 }
    );
  }

  // Create the assignment and pre-create progress entries for each task
  const pack = await prisma.onboardingPack.findUnique({
    where: { id: parsed.data.packId },
    include: { tasks: true },
  });

  if (!pack || pack.deleted) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const assignment = await prisma.staffOnboarding.create({
    data: {
      userId: parsed.data.userId,
      packId: parsed.data.packId,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      progress: {
        create: pack.tasks.map((task) => ({
          taskId: task.id,
          completed: false,
        })),
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      pack: { select: { id: true, name: true } },
      progress: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "assign_onboarding",
      entityType: "StaffOnboarding",
      entityId: assignment.id,
      details: {
        userName: assignment.user.name,
        packName: assignment.pack.name,
      },
    },
  });

  return NextResponse.json(assignment, { status: 201 });
});
