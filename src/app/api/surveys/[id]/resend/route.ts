/**
 * POST /api/surveys/[id]/resend — nudge everyone in the audience who
 * hasn't submitted yet.
 *
 * Re-evaluates the audience against the current user list so anyone
 * who's joined the org/centre since publish is picked up as well.
 * Excludes:
 *   - Users who have already submitted a response (respondentId match)
 *   - Users no longer active
 *
 * For each remaining target:
 *   - Always creates a NEW UserNotification so a fresh bell badge
 *     appears (this is a nudge; re-sending should feel new).
 *   - Creates a Todo only if one doesn't already exist. The publish
 *     step creates todos, and they auto-complete on submit, so a
 *     missing todo means the user deleted theirs — we recreate it.
 *
 * Owner / head_office / admin only. Draft + closed surveys reject.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { isInAudience, type AudienceUser } from "@/lib/survey-audience";
import { getWeekStart } from "@/lib/utils";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    const survey = await prisma.survey.findUnique({
      where: { id },
    });
    if (!survey || survey.deleted) {
      throw ApiError.notFound("Survey not found");
    }
    if (survey.status !== "published") {
      throw ApiError.badRequest(
        `Cannot resend — survey is ${survey.status}. Only published surveys can be resent.`,
      );
    }
    // Refuse resend on anonymous surveys: since respondentId is nulled
    // on submit, we can't tell who has vs hasn't responded and would
    // spam everyone. If Daniel needs to nudge an anonymous survey he
    // has to publish a fresh one.
    if (survey.anonymous) {
      throw ApiError.badRequest(
        "Anonymous surveys can't be resent — we can't tell who's already responded. Publish a new survey if you need to remind people.",
      );
    }
    if (survey.closesAt && new Date(survey.closesAt) < new Date()) {
      throw ApiError.badRequest("This survey has passed its closing date.");
    }

    // Build audience from all currently-active users, then subtract
    // those who have already responded.
    const activeUsers = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        role: true,
        serviceId: true,
        employmentType: true,
        active: true,
        serviceMemberships: {
          where: { status: "active" },
          select: { serviceId: true },
        },
      },
    });
    const audience: AudienceUser[] = activeUsers
      .map((u) => ({
        id: u.id,
        role: u.role,
        serviceId: u.serviceId,
        membershipServiceIds: u.serviceMemberships.map((m) => m.serviceId),
        employmentType: u.employmentType,
        active: u.active,
      }))
      .filter((u) => isInAudience(survey, u));

    const respondedIds = new Set(
      (
        await prisma.surveyResponse.findMany({
          where: { surveyId: id, respondentId: { not: null } },
          select: { respondentId: true },
        })
      )
        .map((r) => r.respondentId)
        .filter((x): x is string => x !== null),
    );

    const outstanding = audience.filter((u) => !respondedIds.has(u.id));

    if (outstanding.length === 0) {
      return NextResponse.json({
        nudged: 0,
        message: "Everyone in the audience has already responded.",
      });
    }

    // Which of the outstanding users still has an open todo? Skip
    // creating a new one for them — just fire the notification. Others
    // need a fresh todo (their original was deleted).
    const existingTodos = await prisma.todo.findMany({
      where: {
        surveyId: id,
        assigneeId: { in: outstanding.map((u) => u.id) },
        deleted: false,
      },
      select: { assigneeId: true, status: true },
    });
    const userIdsWithOpenTodo = new Set(
      existingTodos
        .filter((t) => t.status !== "complete" && !!t.assigneeId)
        .map((t) => t.assigneeId as string),
    );
    const needsTodo = outstanding.filter(
      (u) => !userIdsWithOpenTodo.has(u.id),
    );

    const dueDate = survey.closesAt
      ? new Date(survey.closesAt)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          return d;
        })();
    const weekOf = getWeekStart();

    await prisma.$transaction([
      // Always create a fresh notification — this is a nudge, users
      // should see a new bell badge. Not using skipDuplicates.
      prisma.userNotification.createMany({
        data: outstanding.map((u) => ({
          userId: u.id,
          type: NOTIFICATION_TYPES.SURVEY_ASSIGNED,
          title: "Reminder: your survey is still waiting",
          body: `${survey.title} — please complete it when you get a moment.`,
          link: "/surveys",
        })),
      }),
      // Todos only for users who don't already have an open one.
      ...(needsTodo.length > 0
        ? [
            prisma.todo.createMany({
              data: needsTodo.map((u) => ({
                title: `Complete survey: ${survey.title}`,
                description:
                  "You've been reminded about a survey. Please complete it on the My Surveys page.",
                assigneeId: u.id,
                createdById: session!.user.id,
                dueDate,
                weekOf,
                surveyId: id,
              })),
            }),
          ]
        : []),
    ]);

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "resend",
        entityType: "Survey",
        entityId: id,
        details: {
          title: survey.title,
          nudged: outstanding.length,
          newTodos: needsTodo.length,
        },
      },
    });

    logger.info("Survey resend", {
      surveyId: id,
      nudged: outstanding.length,
      newTodos: needsTodo.length,
    });

    return NextResponse.json({
      nudged: outstanding.length,
      newTodos: needsTodo.length,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
