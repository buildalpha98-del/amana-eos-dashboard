/**
 * Admin update / delete for a single quiz question.
 *   PATCH  /api/lms/quiz-questions/[id]
 *   DELETE /api/lms/quiz-questions/[id]
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";

const patchSchema = z.object({
  question: z.string().min(1).optional(),
  options: z.array(z.string().min(1)).min(2).optional(),
  correctIndex: z.number().int().nonnegative().optional(),
  explanation: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const { id } = await context!.params!;
    const body = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid input", parsed.error.flatten());
    }
    // Guard correctIndex against the effective option count.
    if (parsed.data.correctIndex !== undefined) {
      const options =
        parsed.data.options ??
        ((await prisma.lMSQuizQuestion.findUnique({
          where: { id },
          select: { options: true },
        }))?.options as string[] | undefined);
      if (options && parsed.data.correctIndex >= options.length) {
        throw ApiError.badRequest("correctIndex is out of range for the options");
      }
    }
    const updated = await prisma.lMSQuizQuestion.update({
      where: { id },
      data: {
        ...(parsed.data.question !== undefined ? { question: parsed.data.question } : {}),
        ...(parsed.data.options !== undefined ? { options: parsed.data.options } : {}),
        ...(parsed.data.correctIndex !== undefined ? { correctIndex: parsed.data.correctIndex } : {}),
        ...(parsed.data.explanation !== undefined ? { explanation: parsed.data.explanation } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
    });
    return NextResponse.json(updated);
  },
  { roles: [...ADMIN_ROLES] },
);

export const DELETE = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await context!.params!;
    await prisma.lMSQuizQuestion.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
  { roles: [...ADMIN_ROLES] },
);
