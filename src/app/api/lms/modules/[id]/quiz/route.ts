/**
 * Quiz attempts for an LMS module.
 *
 *   GET  /api/lms/modules/[id]/quiz  — start an attempt: creates an in-progress
 *        LMSQuizAttempt, returns shuffled questions (NO correct answers).
 *   POST /api/lms/modules/[id]/quiz  — submit: scores server-side, records the
 *        attempt, and on a pass completes the module + recomputes induction.
 *
 * Shuffling/scoring is entirely server-side (see src/lib/quiz.ts). The correct
 * index only appears in the POST response, after answering — the teaching moment.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { buildShuffledQuestions, scoreAttempt, type QuizQuestion } from "@/lib/quiz";
import { onModuleProgressed } from "@/lib/induction";

/** Resolve the module, its course, and the caller's enrollment — or throw. */
async function resolveEnrollment(moduleId: string, userId: string) {
  const module = await prisma.lMSModule.findUnique({
    where: { id: moduleId },
    select: { id: true, courseId: true, type: true },
  });
  if (!module) throw ApiError.notFound("Module not found");

  const enrollment = await prisma.lMSEnrollment.findUnique({
    where: { userId_courseId: { userId, courseId: module.courseId } },
    select: { id: true },
  });
  if (!enrollment) {
    throw ApiError.forbidden("You are not enrolled in this course.");
  }
  return { module, enrollmentId: enrollment.id };
}

async function loadQuestions(moduleId: string): Promise<QuizQuestion[]> {
  const rows = await prisma.lMSQuizQuestion.findMany({
    where: { moduleId, active: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((q) => ({
    id: q.id,
    question: q.question,
    options: (q.options as string[]) ?? [],
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  }));
}

// GET — start an attempt.
export const GET = withApiAuth(async (_req, session, context) => {
  const { id: moduleId } = await context!.params!;
  const userId = session!.user.id;
  const { enrollmentId } = await resolveEnrollment(moduleId, userId);

  const priorAttempts = await prisma.lMSQuizAttempt.count({
    where: { enrollmentId, moduleId },
  });
  const attemptNumber = priorAttempts + 1;

  const attempt = await prisma.lMSQuizAttempt.create({
    data: { enrollmentId, moduleId, attemptNumber },
    select: { id: true },
  });

  const questions = await loadQuestions(moduleId);
  const shuffled = buildShuffledQuestions({
    enrollmentId,
    moduleId,
    attemptNumber,
    questions,
  });

  return NextResponse.json({
    attemptId: attempt.id,
    attemptNumber,
    questions: shuffled,
  });
});

const submitSchema = z.object({
  attemptId: z.string().min(1),
  answers: z.array(
    z.object({ questionId: z.string().min(1), selectedIndex: z.number().int() }),
  ),
});

// POST — submit an attempt.
export const POST = withApiAuth(async (req, session, context) => {
  const { id: moduleId } = await context!.params!;
  const userId = session!.user.id;
  const { enrollmentId } = await resolveEnrollment(moduleId, userId);

  const body = await parseJsonBody(req);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }

  const attempt = await prisma.lMSQuizAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    select: { id: true, enrollmentId: true, moduleId: true, attemptNumber: true, submittedAt: true },
  });
  if (!attempt || attempt.enrollmentId !== enrollmentId || attempt.moduleId !== moduleId) {
    throw ApiError.notFound("Attempt not found");
  }
  if (attempt.submittedAt) {
    throw ApiError.conflict("This attempt has already been submitted.");
  }

  const questions = await loadQuestions(moduleId);
  const { score, passed, results } = scoreAttempt({
    enrollmentId,
    moduleId,
    attemptNumber: attempt.attemptNumber,
    questions,
    answers: parsed.data.answers,
  });

  await prisma.lMSQuizAttempt.update({
    where: { id: attempt.id },
    data: { answers: parsed.data.answers, score, passed, submittedAt: new Date() },
  });

  if (passed) {
    await prisma.lMSModuleProgress.upsert({
      where: { enrollmentId_moduleId: { enrollmentId, moduleId } },
      update: { completed: true, completedAt: new Date(), score },
      create: { enrollmentId, moduleId, completed: true, completedAt: new Date(), score },
    });
    await recalcEnrollmentStatus(enrollmentId);
    await onModuleProgressed(userId);
  }

  // Explanations only after submit — never before.
  const explanations = questions.map((q) => ({
    questionId: q.id,
    correctIndex: q.correctIndex,
    explanation: q.explanation ?? null,
  }));

  return NextResponse.json({ score, passed, results, explanations });
});

/**
 * Recompute an enrollment's status from its required-module completion.
 * Mirrors the legacy pattern in enrollments/route.ts. Completion requires at
 * least one required module (all-optional courses never "complete").
 */
async function recalcEnrollmentStatus(enrollmentId: string) {
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

  await prisma.lMSEnrollment.update({
    where: { id: enrollmentId },
    data: {
      status: allDone ? "completed" : anyStarted ? "in_progress" : "enrolled",
      startedAt: anyStarted && !enrollment.startedAt ? new Date() : undefined,
      completedAt: allDone ? new Date() : null,
    },
  });
}
