/**
 * Admin CRUD for quiz questions on a module.
 *   GET  /api/lms/quiz-questions?moduleId=... — list (admin authoring view;
 *        includes correctIndex/explanation, unlike the learner-facing quiz API).
 *   POST /api/lms/quiz-questions — create a question.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const moduleId = searchParams.get("moduleId");
    if (!moduleId) throw ApiError.badRequest("moduleId is required");
    const questions = await prisma.lMSQuizQuestion.findMany({
      where: { moduleId },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(questions);
  },
  { roles: [...ADMIN_ROLES] },
);

const createSchema = z.object({
  moduleId: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctIndex: z.number().int().nonnegative(),
  explanation: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const POST = withApiAuth(
  async (req) => {
    const body = await parseJsonBody(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid input", parsed.error.flatten());
    }
    if (parsed.data.correctIndex >= parsed.data.options.length) {
      throw ApiError.badRequest("correctIndex is out of range for the given options");
    }
    const created = await prisma.lMSQuizQuestion.create({
      data: {
        moduleId: parsed.data.moduleId,
        question: parsed.data.question,
        options: parsed.data.options,
        correctIndex: parsed.data.correctIndex,
        explanation: parsed.data.explanation ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    return NextResponse.json(created, { status: 201 });
  },
  { roles: [...ADMIN_ROLES] },
);
