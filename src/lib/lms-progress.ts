/**
 * Shared enrollment-progress recompute for the LMS.
 *
 * Single source of truth for deriving an enrollment's status (and, on
 * completion, its course score) from module progress. Used by every surface
 * that writes LMSModuleProgress: the quiz submit route, the player's
 * module-progress route, and the admin enrollments route (progress mode).
 */
import { prisma } from "@/lib/prisma";

/**
 * Recompute an enrollment's status from its required-module completion.
 * Completion requires at least one required module (all-optional courses never
 * "complete"). On completion the enrollment's score is set to the average of
 * its scored module progress (quiz results) so the transcript has a result;
 * it is cleared again if completion is undone.
 */
export async function recalcEnrollmentStatus(enrollmentId: string): Promise<void> {
  const enrollment = await prisma.lMSEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: { include: { modules: { where: { isRequired: true }, select: { id: true } } } },
      moduleProgress: true,
    },
  });
  if (!enrollment) return;

  const requiredIds = enrollment.course.modules.map((m) => m.id);
  const completedRequired = enrollment.moduleProgress.filter(
    (p) => p.completed && requiredIds.includes(p.moduleId),
  ).length;
  const anyStarted = enrollment.moduleProgress.some((p) => p.completed);
  const allDone = requiredIds.length > 0 && completedRequired >= requiredIds.length;

  const scores = enrollment.moduleProgress
    .map((p) => p.score)
    .filter((s): s is number => s != null);
  const courseScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  await prisma.lMSEnrollment.update({
    where: { id: enrollmentId },
    data: {
      status: allDone ? "completed" : anyStarted ? "in_progress" : "enrolled",
      startedAt: anyStarted && !enrollment.startedAt ? new Date() : undefined,
      completedAt: allDone ? new Date() : null,
      score: allDone ? courseScore : null,
    },
  });
}
