/**
 * POST /api/surveys/[id]/responses — staff submit a response
 * GET  /api/surveys/[id]/responses — admin fetches individual responses
 *                                    (not aggregate — that's /results)
 *
 * Submit rules:
 *   - Survey must be published (draft or closed = 400)
 *   - Survey must not have passed closesAt (400)
 *   - User must be in the audience (403)
 *   - Non-anonymous surveys: one response per user (409)
 *   - Anonymous surveys: respondentId is nulled before storage
 *   - Every required question needs an answer of the correct shape
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isInAudience } from "@/lib/survey-audience";

const answerSchema = z.object({
  questionId: z.string().min(1),
  yesNo: z.boolean().nullable().optional(),
  choiceIndexes: z.array(z.number().int().min(0)).optional(),
  textValue: z.string().max(20_000).nullable().optional(),
  ratingValue: z.number().int().min(1).max(5).nullable().optional(),
});

const submitSchema = z.object({
  answers: z.array(answerSchema).min(1),
});

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await context!.params!;
    const survey = await prisma.survey.findUnique({
      where: { id },
      include: {
        responses: {
          include: {
            respondent: {
              select: { id: true, name: true, email: true, avatar: true },
            },
            answers: {
              include: {
                question: { select: { id: true, title: true, type: true, options: true, sortOrder: true } },
              },
            },
          },
          orderBy: { submittedAt: "desc" },
        },
      },
    });
    if (!survey || survey.deleted) throw ApiError.notFound("Survey not found");

    // For anonymous surveys, strip the respondent from the payload
    // even though we already nulled it on write — belt & braces.
    if (survey.anonymous) {
      survey.responses.forEach((r) => {
        r.respondent = null;
        r.respondentId = null;
      });
    }
    return NextResponse.json({ responses: survey.responses });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const raw = await parseJsonBody(req);
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }
  const { answers } = parsed.data;

  const survey = await prisma.survey.findUnique({
    where: { id },
    include: { questions: true },
  });
  if (!survey || survey.deleted) throw ApiError.notFound("Survey not found");
  if (survey.status !== "published") {
    throw ApiError.badRequest(
      `Survey is ${survey.status} — responses are not accepted.`,
    );
  }
  if (survey.closesAt && new Date(survey.closesAt) < new Date()) {
    throw ApiError.badRequest("This survey has passed its closing date.");
  }

  const me = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: {
      id: true,
      role: true,
      serviceId: true,
      employmentType: true,
      active: true,
      // 2026-07-08: include active service memberships so by_service
      // audience matches memberships, not just primary service.
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
  if (!isInAudience(survey, audienceUser)) {
    throw ApiError.forbidden("You are not in this survey's audience.");
  }

  // For non-anonymous surveys, block re-submission — the unique index
  // would throw a nasty error otherwise. Anonymous surveys allow
  // repeat submissions (all rows have respondentId = null).
  if (!survey.anonymous) {
    const existing = await prisma.surveyResponse.findFirst({
      where: { surveyId: id, respondentId: me.id },
    });
    if (existing) {
      throw new ApiError(409, "You have already responded to this survey.");
    }
  }

  // Validate every required question has an answer + shape matches type.
  const answersByQuestionId = new Map(answers.map((a) => [a.questionId, a]));
  const validAnswerRows: {
    questionId: string;
    yesNo: boolean | null;
    choiceIndexes: number[];
    textValue: string | null;
    ratingValue: number | null;
  }[] = [];

  for (const q of survey.questions) {
    const a = answersByQuestionId.get(q.id);
    const hasAnswer =
      !!a &&
      (a.yesNo !== null && a.yesNo !== undefined
        ? true
        : (a.choiceIndexes && a.choiceIndexes.length > 0) ||
          (a.textValue != null && a.textValue.trim() !== "") ||
          (a.ratingValue != null));
    if (!hasAnswer) {
      if (q.required) {
        throw ApiError.badRequest(`Missing required answer: "${q.title}"`);
      }
      continue;
    }
    // Type-check shape
    switch (q.type) {
      case "yes_no":
        if (typeof a!.yesNo !== "boolean") {
          throw ApiError.badRequest(`"${q.title}" needs a yes/no answer.`);
        }
        validAnswerRows.push({
          questionId: q.id,
          yesNo: a!.yesNo,
          choiceIndexes: [],
          textValue: null,
          ratingValue: null,
        });
        break;
      case "single_choice":
        if (!a!.choiceIndexes || a!.choiceIndexes.length !== 1) {
          throw ApiError.badRequest(
            `"${q.title}" needs exactly one option selected.`,
          );
        }
        if (a!.choiceIndexes.some((i) => i < 0 || i >= q.options.length)) {
          throw ApiError.badRequest(`"${q.title}": option index out of range.`);
        }
        validAnswerRows.push({
          questionId: q.id,
          yesNo: null,
          choiceIndexes: a!.choiceIndexes,
          textValue: null,
          ratingValue: null,
        });
        break;
      case "multi_choice":
        if (!a!.choiceIndexes || a!.choiceIndexes.length < 1) {
          throw ApiError.badRequest(
            `"${q.title}" needs at least one option selected.`,
          );
        }
        if (a!.choiceIndexes.some((i) => i < 0 || i >= q.options.length)) {
          throw ApiError.badRequest(`"${q.title}": option index out of range.`);
        }
        validAnswerRows.push({
          questionId: q.id,
          yesNo: null,
          choiceIndexes: Array.from(new Set(a!.choiceIndexes)),
          textValue: null,
          ratingValue: null,
        });
        break;
      case "short_text":
      case "long_text":
        if (!a!.textValue || a!.textValue.trim() === "") {
          throw ApiError.badRequest(`"${q.title}" needs a text answer.`);
        }
        validAnswerRows.push({
          questionId: q.id,
          yesNo: null,
          choiceIndexes: [],
          textValue: a!.textValue,
          ratingValue: null,
        });
        break;
      case "rating":
        if (!a!.ratingValue || a!.ratingValue < 1 || a!.ratingValue > 5) {
          throw ApiError.badRequest(`"${q.title}" needs a rating from 1 to 5.`);
        }
        validAnswerRows.push({
          questionId: q.id,
          yesNo: null,
          choiceIndexes: [],
          textValue: null,
          ratingValue: a!.ratingValue,
        });
        break;
    }
  }

  const response = await prisma.surveyResponse.create({
    data: {
      surveyId: id,
      respondentId: survey.anonymous ? null : me.id,
      answers: { create: validAnswerRows },
    },
    include: { answers: true },
  });

  // 2026-07-08: auto-complete the Todo that was created on publish so
  // the survey drops out of the user's task list once they've done
  // it. Safe on anonymous surveys because the todo was still created
  // with a real assigneeId at publish time (assignment isn't the same
  // as identifying the response). We match by (assigneeId, surveyId)
  // and only flip status=complete rows that were still pending.
  try {
    await prisma.todo.updateMany({
      where: {
        assigneeId: me.id,
        surveyId: id,
        status: { in: ["pending", "in_progress"] },
      },
      data: { status: "complete", completedAt: new Date() },
    });
  } catch {
    // Non-fatal — the response is already saved. If todo completion
    // fails the user can complete it manually in /todos.
  }

  return NextResponse.json(response, { status: 201 });
});
