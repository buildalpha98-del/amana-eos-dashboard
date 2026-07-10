/**
 * GET  /api/surveys           — list surveys
 *   ?mine=1  → surveys the current user is in the audience for
 *              (staff-facing "My Surveys" view)
 *   default  → all surveys (admin-facing manager view)
 *
 * POST /api/surveys           — create a draft survey (owner/admin/head_office)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isInAudience } from "@/lib/survey-audience";
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
  required: z.boolean().optional().default(true),
  options: z.array(z.string().min(1).max(500)).max(50).optional().default([]),
  sortOrder: z.number().int().min(0).optional().default(0),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  anonymous: z.boolean().optional().default(false),
  audience: audienceEnum.optional().default("all_staff"),
  audienceRoles: z.array(z.string()).optional().default([]),
  audienceServiceIds: z.array(z.string()).optional().default([]),
  audienceEmploymentTypes: z.array(z.string()).optional().default([]),
  closesAt: z.string().datetime().nullable().optional(),
  questions: z.array(questionInputSchema).optional().default([]),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine") === "1";

  if (mine) {
    // Staff-facing: return published surveys the current user belongs
    // to. Also include whether they've already submitted (so the UI
    // can render "Take" vs "View my response" states).
    const surveys = await prisma.survey.findMany({
      where: { status: "published", deleted: false },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        _count: { select: { responses: true } },
      },
      orderBy: { publishedAt: "desc" },
    });
    const me = await prisma.user.findUnique({
      where: { id: session!.user.id },
      select: {
        id: true,
        role: true,
        serviceId: true,
        employmentType: true,
        active: true,
        // 2026-07-08: also include active service memberships so
        // "by_service" surveys reach staff attached to a centre via
        // the Services → Staff tab (not just primary-service).
        serviceMemberships: {
          where: { status: "active" },
          select: { serviceId: true },
        },
      },
    });
    if (!me) throw ApiError.notFound("User not found");

    const audienceUser = {
      id: me.id,
      role: me.role,
      serviceId: me.serviceId,
      membershipServiceIds: me.serviceMemberships.map((m) => m.serviceId),
      employmentType: me.employmentType,
      active: me.active,
    };
    const filtered = surveys.filter((s) => isInAudience(s, audienceUser));

    // Attach "I have already responded" flag per survey. For anonymous
    // surveys we can't tell (respondentId is nulled), so we surface a
    // separate `anonymous: true` flag instead and let the UI decide.
    const respondedIds = new Set(
      (
        await prisma.surveyResponse.findMany({
          where: {
            respondentId: me.id,
            surveyId: { in: filtered.map((s) => s.id) },
          },
          select: { surveyId: true },
        })
      ).map((r) => r.surveyId),
    );

    return NextResponse.json({
      surveys: filtered.map((s) => ({
        ...s,
        _iHaveResponded: respondedIds.has(s.id),
      })),
    });
  }

  // Admin view — role-gated. Everything, all statuses, with response
  // counts for the list card. Question detail is deferred to GET
  // /api/surveys/[id] to keep the list payload small.
  const role = session!.user.role;
  if (role !== "owner" && role !== "admin" && role !== "head_office") {
    throw ApiError.forbidden("Admin, owner, or state manager required");
  }

  const surveys = await prisma.survey.findMany({
    where: { deleted: false },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { questions: true, responses: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ surveys });
});

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const data = parsed.data;

    // Sanity: choice questions must have >= 2 options; open-text /
    // yes-no / rating must have zero options. Catch this on the
    // server so a hand-crafted POST can't create a broken survey
    // that would crash the take-survey renderer.
    for (const [i, q] of data.questions.entries()) {
      const needsOptions =
        q.type === "single_choice" || q.type === "multi_choice";
      if (needsOptions && q.options.length < 2) {
        throw ApiError.badRequest(
          `Question ${i + 1}: ${q.type} needs at least 2 options`,
        );
      }
      if (!needsOptions && q.options.length > 0) {
        throw ApiError.badRequest(
          `Question ${i + 1}: options are only for single/multi choice`,
        );
      }
    }

    const survey = await prisma.survey.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        anonymous: data.anonymous,
        audience: data.audience,
        audienceRoles: data.audienceRoles as Role[],
        audienceServiceIds: data.audienceServiceIds,
        audienceEmploymentTypes: data.audienceEmploymentTypes as EmploymentType[],
        closesAt: data.closesAt ? new Date(data.closesAt) : null,
        createdById: session!.user.id,
        questions: {
          create: data.questions.map((q, i) => ({
            type: q.type,
            title: q.title,
            description: q.description ?? null,
            required: q.required ?? true,
            options: q.options,
            sortOrder: q.sortOrder ?? i,
          })),
        },
      },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(survey, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
