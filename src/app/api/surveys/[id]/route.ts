/**
 * GET   /api/surveys/[id] — full survey with questions
 * PATCH /api/surveys/[id] — update fields + replace questions wholesale
 * DELETE /api/surveys/[id] — soft delete
 *
 * PATCH replaces the questions array wholesale rather than diffing.
 * The builder UI edits questions in one form and re-sends the whole
 * ordered list; server drops+recreates them inside a transaction.
 * Existing responses reference question IDs that no longer exist
 * after replacement — that's why the builder DISABLES editing once
 * a survey has responses (enforced client-side + server-side).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import type {
  EmploymentType,
  Role,
  SurveyAudience,
  SurveyQuestionType,
} from "@prisma/client";

const audienceEnum = z.enum([
  "all_staff",
  "by_role",
  "by_service",
  "by_employment_type",
]) as z.ZodType<SurveyAudience>;

const questionTypeEnum = z.enum([
  "yes_no",
  "single_choice",
  "multi_choice",
  "short_text",
  "long_text",
  "rating",
]) as z.ZodType<SurveyQuestionType>;

const questionInputSchema = z.object({
  type: questionTypeEnum,
  title: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().min(1).max(500)).max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  anonymous: z.boolean().optional(),
  audience: audienceEnum.optional(),
  audienceRoles: z.array(z.string()).optional(),
  audienceServiceIds: z.array(z.string()).optional(),
  audienceEmploymentTypes: z.array(z.string()).optional(),
  closesAt: z.string().datetime().nullable().optional(),
  questions: z.array(questionInputSchema).optional(),
});

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const survey = await prisma.survey.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { responses: true } },
    },
  });
  if (!survey || survey.deleted) throw ApiError.notFound("Survey not found");

  // Non-admin users can only fetch a survey they belong to, and only
  // once it's published — draft surveys aren't visible to targets yet.
  const role = session!.user.role;
  const isAdmin =
    role === "owner" || role === "admin" || role === "head_office";
  if (!isAdmin && survey.status === "draft") {
    throw ApiError.forbidden("Survey not yet published");
  }

  return NextResponse.json(survey);
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const existing = await prisma.survey.findUnique({
      where: { id },
      include: { _count: { select: { responses: true } } },
    });
    if (!existing || existing.deleted) {
      throw ApiError.notFound("Survey not found");
    }

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const p = parsed.data;

    // Editing questions after responses exist would orphan them.
    // Refuse — the admin must clone the survey or close it and start
    // a new one. Copy-editing the survey title/description stays OK.
    if (p.questions && existing._count.responses > 0) {
      throw ApiError.badRequest(
        "Cannot edit questions after responses have been collected. Clone or close this survey and start a new one.",
      );
    }

    const update: Record<string, unknown> = {};
    if (p.title !== undefined) update.title = p.title;
    if (p.description !== undefined) update.description = p.description;
    if (p.anonymous !== undefined) update.anonymous = p.anonymous;
    if (p.audience !== undefined) update.audience = p.audience;
    if (p.audienceRoles !== undefined) update.audienceRoles = p.audienceRoles as Role[];
    if (p.audienceServiceIds !== undefined)
      update.audienceServiceIds = p.audienceServiceIds;
    if (p.audienceEmploymentTypes !== undefined)
      update.audienceEmploymentTypes = p.audienceEmploymentTypes as EmploymentType[];
    if (p.closesAt !== undefined) {
      update.closesAt = p.closesAt ? new Date(p.closesAt) : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.survey.update({ where: { id }, data: update });
      if (p.questions) {
        // Sanity — same validation as create.
        for (const [i, q] of p.questions.entries()) {
          const needsOptions =
            q.type === "single_choice" || q.type === "multi_choice";
          const optCount = q.options?.length ?? 0;
          if (needsOptions && optCount < 2) {
            throw new Error(
              `Question ${i + 1}: ${q.type} needs at least 2 options`,
            );
          }
          if (!needsOptions && optCount > 0) {
            throw new Error(
              `Question ${i + 1}: options are only for single/multi choice`,
            );
          }
        }
        await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
        await tx.surveyQuestion.createMany({
          data: p.questions.map((q, i) => ({
            surveyId: id,
            type: q.type,
            title: q.title,
            description: q.description ?? null,
            required: q.required ?? true,
            options: q.options ?? [],
            sortOrder: q.sortOrder ?? i,
          })),
        });
      }
      return s;
    });

    const full = await prisma.survey.findUnique({
      where: { id: updated.id },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { responses: true } },
      },
    });

    return NextResponse.json(full);
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const DELETE = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await context!.params!;
    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing || existing.deleted) {
      throw ApiError.notFound("Survey not found");
    }
    await prisma.survey.update({
      where: { id },
      data: { deleted: true },
    });
    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "admin"] },
);
