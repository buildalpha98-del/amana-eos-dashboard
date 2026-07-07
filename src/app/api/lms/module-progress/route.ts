/**
 * Mark a non-quiz module (document / video) complete from the course player.
 *
 * Conforming replacement for the legacy enrollments-route "progress mode":
 * withApiAuth + Zod + ApiError. Upserts LMSModuleProgress, recomputes the
 * enrollment status, and funnels through onModuleProgressed so induction state
 * advances (new_starter → in_training, then readiness recompute).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { onModuleProgressed } from "@/lib/induction";

const bodySchema = z.object({
  enrollmentId: z.string().min(1),
  moduleId: z.string().min(1),
  completed: z.boolean().default(true),
  timeSpent: z.number().int().nonnegative().optional(),
});

export const POST = withApiAuth(async (req, session) => {
  const userId = session!.user.id;
  const body = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const { enrollmentId, moduleId, completed, timeSpent } = parsed.data;

  // Caller must own the enrollment.
  const enrollment = await prisma.lMSEnrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, userId: true, startedAt: true },
  });
  if (!enrollment) throw ApiError.notFound("Enrollment not found");
  if (enrollment.userId !== userId) {
    throw ApiError.forbidden("You can only update your own training progress.");
  }

  await prisma.lMSModuleProgress.upsert({
    where: { enrollmentId_moduleId: { enrollmentId, moduleId } },
    update: {
      completed,
      completedAt: completed ? new Date() : null,
      ...(timeSpent !== undefined ? { timeSpent } : {}),
    },
    create: {
      enrollmentId,
      moduleId,
      completed,
      completedAt: completed ? new Date() : null,
      ...(timeSpent !== undefined ? { timeSpent } : {}),
    },
  });

  // Recompute enrollment status from required-module completion.
  const full = await prisma.lMSEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: { include: { modules: { where: { isRequired: true }, select: { id: true } } } },
      moduleProgress: true,
    },
  });
  if (full) {
    const requiredIds = full.course.modules.map((m) => m.id);
    const completedRequired = full.moduleProgress.filter(
      (p) => p.completed && requiredIds.includes(p.moduleId),
    ).length;
    const anyStarted = full.moduleProgress.some((p) => p.completed);
    const allDone = requiredIds.length > 0 && completedRequired >= requiredIds.length;
    await prisma.lMSEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: allDone ? "completed" : anyStarted ? "in_progress" : "enrolled",
        startedAt: anyStarted && !full.startedAt ? new Date() : undefined,
        completedAt: allDone ? new Date() : null,
      },
    });
  }

  const inductionStatus = await onModuleProgressed(userId);
  return NextResponse.json({ ok: true, inductionStatus });
});
