/**
 * POST /api/surveys/[id]/publish — draft → published
 *
 * On publish we fan out to every user in the audience so the survey
 * actually reaches them without them having to check the /surveys
 * page. Three surfaces:
 *
 *   1. UserNotification (bell icon on top-right) — one per user,
 *      type SURVEY_ASSIGNED, links straight to /surveys.
 *   2. Todo — one per user, assigned to them, due at survey.closesAt
 *      (or +7 days if no close date). Marked complete automatically
 *      when the user submits their response
 *      (src/app/api/surveys/[id]/responses/route.ts).
 *   3. Home-screen visibility — falls out for free because the
 *      dashboard already shows pending todos + the notification bell.
 *
 * Non-fatal on any secondary failure: the survey itself is published
 * first and audit-logged; the fan-out runs after and logs warnings
 * rather than throwing.
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
    const existing = await prisma.survey.findUnique({
      where: { id },
      include: { _count: { select: { questions: true } } },
    });
    if (!existing || existing.deleted) {
      throw ApiError.notFound("Survey not found");
    }
    if (existing.status !== "draft") {
      throw ApiError.badRequest(
        `Cannot publish — survey is already ${existing.status}.`,
      );
    }
    if (existing._count.questions === 0) {
      throw ApiError.badRequest(
        "Cannot publish a survey with no questions. Add at least one question first.",
      );
    }

    const updated = await prisma.survey.update({
      where: { id },
      data: { status: "published", publishedAt: new Date() },
    });
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "publish",
        entityType: "Survey",
        entityId: id,
        details: { title: existing.title },
      },
    });

    // ── Fan out to audience ────────────────────────────────────
    // Everything below is best-effort: if it fails, the survey is
    // still published and we log a warning. Trying to keep 500-user
    // fan-out from bricking a publish.
    try {
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

      const targets: AudienceUser[] = activeUsers
        .map((u) => ({
          id: u.id,
          role: u.role,
          serviceId: u.serviceId,
          membershipServiceIds: u.serviceMemberships.map((m) => m.serviceId),
          employmentType: u.employmentType,
          active: u.active,
        }))
        .filter((u) => isInAudience(updated, u));

      if (targets.length > 0) {
        // Todo due date — survey close date if set, else +7 days.
        const dueDate = updated.closesAt
          ? new Date(updated.closesAt)
          : (() => {
              const d = new Date();
              d.setDate(d.getDate() + 7);
              return d;
            })();
        const weekOf = getWeekStart();

        await prisma.$transaction([
          prisma.userNotification.createMany({
            data: targets.map((u) => ({
              userId: u.id,
              type: NOTIFICATION_TYPES.SURVEY_ASSIGNED,
              title: "You've been added to a survey",
              body: `${existing.title} — please complete it.`,
              link: "/surveys",
            })),
            skipDuplicates: true,
          }),
          prisma.todo.createMany({
            data: targets.map((u) => ({
              title: `Complete survey: ${existing.title}`,
              description:
                "You've been added to a survey. Please complete it on the My Surveys page.",
              assigneeId: u.id,
              createdById: session!.user.id,
              dueDate,
              weekOf,
              // Correlate back to the survey so we can flip status=complete
              // automatically when the user submits their response.
              surveyId: id,
            })),
            skipDuplicates: true,
          }),
        ]);

        logger.info("Survey published + audience notified", {
          surveyId: id,
          audience: updated.audience,
          notified: targets.length,
        });
      }
    } catch (err) {
      logger.warn("Survey publish fan-out failed", {
        surveyId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
