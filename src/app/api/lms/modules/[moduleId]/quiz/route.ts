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
import {
  buildShuffledQuestions,
  displayCorrectIndex,
  questionsFingerprint,
  scoreAttempt,
  type QuizQuestion,
} from "@/lib/quiz";
import { onModuleProgressed } from "@/lib/induction";
import { recalcEnrollmentStatus } from "@/lib/lms-progress";

/** Resolve the module, its course, and the caller's enrollment — or throw. */
async function resolveEnrollment(moduleId: string, userId: string) {
  const lmsModule = await prisma.lMSModule.findUnique({
    where: { id: moduleId },
    select: { id: true, courseId: true, type: true },
  });
  if (!lmsModule) throw ApiError.notFound("Module not found");

  const enrollment = await prisma.lMSEnrollment.findUnique({
    where: { userId_courseId: { userId, courseId: lmsModule.courseId } },
    select: { id: true },
  });
  if (!enrollment) {
    throw ApiError.forbidden("You are not enrolled in this course.");
  }
  return { module: lmsModule, enrollmentId: enrollment.id };
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

// GET — start (or resume) an attempt.
export const GET = withApiAuth(async (_req, session, context) => {
  const { moduleId } = await context!.params!;
  const userId = session!.user.id;
  const { enrollmentId } = await resolveEnrollment(moduleId, userId);

  const questions = await loadQuestions(moduleId);
  const fingerprint = questionsFingerprint(questions);

  // Reuse an in-progress attempt (abandoned "start" clicks) instead of minting
  // a new row every GET — the deterministic shuffle re-serves the same view.
  // The questions returned are always freshly built, so the fingerprint is
  // refreshed to match what this response shows.
  const existing = await prisma.lMSQuizAttempt.findFirst({
    where: { enrollmentId, moduleId, submittedAt: null },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, attemptNumber: true },
  });

  let attemptId: string;
  let attemptNumber: number;
  if (existing) {
    attemptId = existing.id;
    attemptNumber = existing.attemptNumber;
    await prisma.lMSQuizAttempt.update({
      where: { id: existing.id },
      data: { optionsFingerprint: fingerprint },
    });
  } else {
    const priorAttempts = await prisma.lMSQuizAttempt.count({
      where: { enrollmentId, moduleId },
    });
    attemptNumber = priorAttempts + 1;
    const attempt = await prisma.lMSQuizAttempt.create({
      data: { enrollmentId, moduleId, attemptNumber, optionsFingerprint: fingerprint },
      select: { id: true },
    });
    attemptId = attempt.id;
  }

  const shuffled = buildShuffledQuestions({
    enrollmentId,
    moduleId,
    attemptNumber,
    questions,
  });

  return NextResponse.json({
    attemptId,
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
  const { moduleId } = await context!.params!;
  const userId = session!.user.id;
  const { enrollmentId } = await resolveEnrollment(moduleId, userId);

  const body = await parseJsonBody(req);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }

  const attempt = await prisma.lMSQuizAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    select: {
      id: true,
      enrollmentId: true,
      moduleId: true,
      attemptNumber: true,
      submittedAt: true,
      optionsFingerprint: true,
    },
  });
  if (!attempt || attempt.enrollmentId !== enrollmentId || attempt.moduleId !== moduleId) {
    throw ApiError.notFound("Attempt not found");
  }
  if (attempt.submittedAt) {
    throw ApiError.conflict("This attempt has already been submitted.");
  }

  const questions = await loadQuestions(moduleId);
  // If the question set changed since the attempt started, the display
  // positions the learner clicked no longer map to the options they saw —
  // scoring would be silently wrong. Reject; the player restarts the quiz.
  if (
    attempt.optionsFingerprint &&
    attempt.optionsFingerprint !== questionsFingerprint(questions)
  ) {
    throw ApiError.conflict(
      "This quiz was updated while your attempt was in progress. Please start it again.",
    );
  }
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

  // Explanations only after submit — never before. correctIndex is returned in
  // DISPLAY space (the attempt's shuffled order), since that's what the client
  // renders — the canonical index would highlight the wrong option.
  const ctx = { enrollmentId, moduleId, attemptNumber: attempt.attemptNumber };
  const explanations = questions.map((q) => ({
    questionId: q.id,
    correctIndex: displayCorrectIndex(ctx, q),
    explanation: q.explanation ?? null,
  }));

  return NextResponse.json({ score, passed, results, explanations });
});
