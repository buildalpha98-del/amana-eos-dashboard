import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const initiateSchema = z.object({
  userId: z.string().min(1),
  packId: z.string().min(1),
  lastDay: z.string().optional(),
  reason: z.string().optional(),
});

const progressSchema = z.object({
  offboardingId: z.string().min(1),
  taskId: z.string().min(1),
  completed: z.boolean(),
  notes: z.string().optional(),
});

// GET /api/offboarding/assign — list offboarding assignments
export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  // Staff can only see their own assignments
  const targetUserId =
    session!.user.role === "staff" ? session!.user.id : userId;

  const where: Record<string, unknown> = {};
  if (targetUserId) where.userId = targetUserId;

  const assignments = await prisma.staffOffboarding.findMany({
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

// POST /api/offboarding/assign — initiate offboarding OR update task progress
export const POST = withApiAuth(async (req, session) => {
const body = await req.json();

  // ── Mode B: Update progress on an existing offboarding ─────────
  if (body.offboardingId && body.taskId !== undefined) {
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Staff can only update their own progress
    if (session!.user.role === "staff") {
      const assignment = await prisma.staffOffboarding.findUnique({
        where: { id: parsed.data.offboardingId },
      });
      if (!assignment || assignment.userId !== session!.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const progress = await prisma.staffOffboardingProgress.upsert({
      where: {
        offboardingId_taskId: {
          offboardingId: parsed.data.offboardingId,
          taskId: parsed.data.taskId,
        },
      },
      update: {
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
        completedById: parsed.data.completed ? session!.user.id : null,
        notes: parsed.data.notes,
      },
      create: {
        offboardingId: parsed.data.offboardingId,
        taskId: parsed.data.taskId,
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
        completedById: parsed.data.completed ? session!.user.id : null,
        notes: parsed.data.notes,
      },
    });

    // Recalculate overall status
    const assignment = await prisma.staffOffboarding.findUnique({
      where: { id: parsed.data.offboardingId },
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

      await prisma.staffOffboarding.update({
        where: { id: parsed.data.offboardingId },
        data: {
          status: allDone ? "completed" : anyStarted ? "in_progress" : "not_started",
          startedAt: anyStarted && !assignment.startedAt ? new Date() : undefined,
          completedAt: allDone ? new Date() : null,
        },
      });

      // When all required tasks completed and deactivateOnComplete is true
      if (allDone && assignment.deactivateOnComplete) {
        // Set user as inactive
        await prisma.user.update({
          where: { id: assignment.userId },
          data: { active: false },
        });

        // Terminate active employment contracts
        await prisma.employmentContract.updateMany({
          where: {
            userId: assignment.userId,
            status: "active",
          },
          data: {
            status: "terminated",
          },
        });

        await prisma.activityLog.create({
          data: {
            userId: session!.user.id,
            action: "offboarding_complete_deactivate",
            entityType: "StaffOffboarding",
            entityId: parsed.data.offboardingId,
            details: {
              userId: assignment.userId,
              deactivated: true,
              contractsTerminated: true,
            },
          },
        });
      }
    }

    return NextResponse.json(progress);
  }

  // ── Mode A: Initiate offboarding (owner/admin only) ────────────
  if (session!.user.role !== "owner" && session!.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = initiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Check if already assigned
  const existing = await prisma.staffOffboarding.findUnique({
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

  // Get pack with tasks
  const pack = await prisma.offboardingPack.findUnique({
    where: { id: parsed.data.packId },
    include: { tasks: true },
  });

  if (!pack || pack.deleted) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const assignment = await prisma.staffOffboarding.create({
    data: {
      userId: parsed.data.userId,
      packId: parsed.data.packId,
      lastDay: parsed.data.lastDay ? new Date(parsed.data.lastDay) : null,
      reason: parsed.data.reason,
      initiatedById: session!.user.id,
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
      action: "initiate_offboarding",
      entityType: "StaffOffboarding",
      entityId: assignment.id,
      details: {
        userName: assignment.user.name,
        packName: assignment.pack.name,
        lastDay: parsed.data.lastDay,
        reason: parsed.data.reason,
      },
    },
  });

  return NextResponse.json(assignment, { status: 201 });
});
