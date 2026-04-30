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
//
// Scoping (added 2026-04-29 to close confidentiality bug — previously only
// `staff` was scoped, so members and coordinators saw every other staff
// member's onboarding assignments):
//   - owner / head_office / admin : full access; can pass ?userId= to filter
//   - everyone else (marketing / coordinator / member / staff) : forced to
//     their own user ID. The ?userId= query param is ignored unless it
//     matches session.user.id.
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const role = session!.user.role as string;
  const isAdminLike = role === "owner" || role === "head_office" || role === "admin";

  const targetUserId = isAdminLike ? userId : session!.user.id;

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

  // ── Lazy task backfill (added 2026-04-29) ──────────────────────
  // The original assignment-creation flow snapshots pack.tasks into per-row
  // progress entries. If admin then ADDS new tasks to the pack later, those
  // tasks aren't in any pre-existing assignment's progress array — the
  // assignee sees "0/0 tasks" or a stale completion fraction. This lazy
  // backfill detects the mismatch on read (pack.tasks > progress rows) and
  // creates the missing progress rows, then returns the patched payload.
  const stale = assignments.filter(
    (a) => (a.pack?._count?.tasks ?? 0) > (a.progress?.length ?? 0),
  );
  if (stale.length > 0) {
    // One bulk fetch for all stale packs' task IDs (avoids N+1 in the common
    // case where multiple assignees share the same pack).
    const stalePackIds = Array.from(new Set(stale.map((a) => a.packId)));
    const stalePacks = await prisma.onboardingPack.findMany({
      where: { id: { in: stalePackIds } },
      include: { tasks: { select: { id: true } } },
    });
    const taskIdsByPack = new Map(
      stalePacks.map((p) => [p.id, p.tasks.map((t) => t.id)]),
    );

    // Build the createMany payload: one row per (assignment, missing task).
    const rowsToCreate: { onboardingId: string; taskId: string; completed: boolean }[] = [];
    for (const assignment of stale) {
      const allTaskIds = taskIdsByPack.get(assignment.packId) ?? [];
      const existingTaskIds = new Set(assignment.progress.map((p) => p.taskId));
      for (const taskId of allTaskIds) {
        if (!existingTaskIds.has(taskId)) {
          rowsToCreate.push({
            onboardingId: assignment.id,
            taskId,
            completed: false,
          });
        }
      }
    }
    if (rowsToCreate.length > 0) {
      await prisma.staffOnboardingProgress.createMany({
        data: rowsToCreate,
        skipDuplicates: true,
      });
      // Re-fetch only the affected assignments so the response reflects
      // the new progress rows. Cheaper than re-fetching everything.
      const refetched = await prisma.staffOnboarding.findMany({
        where: { id: { in: stale.map((a) => a.id) } },
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
      });
      const refetchedById = new Map(refetched.map((a) => [a.id, a]));
      for (let i = 0; i < assignments.length; i++) {
        const fresh = refetchedById.get(assignments[i].id);
        if (fresh) assignments[i] = fresh;
      }
    }
  }

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
