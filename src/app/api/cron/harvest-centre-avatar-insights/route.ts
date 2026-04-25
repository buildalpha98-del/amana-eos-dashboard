import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

/**
 * POST /api/cron/harvest-centre-avatar-insights
 *
 * Daily harvest (6am AEST) that scans the last 24 hours of NpsSurveyResponse,
 * QuickFeedback and ParentFeedback records and creates draft
 * CentreAvatarInsight rows (status: pending_review) against each centre's
 * Avatar.
 *
 * Idempotency: every insert is de-duplicated via the unique
 * (harvestedFrom, sourceRecordId) constraint — re-running the cron for an
 * already-harvested record is a no-op.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const authResult = verifyCronSecret(req);
  if (authResult) return authResult.error;

  const guard = await acquireCronLock("harvest-centre-avatar-insights", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    // 26h lookback gives a 2h overlap with the previous run. Idempotency is
    // guaranteed by the @@unique([harvestedFrom, sourceRecordId]) constraint
    // (P2002 swallowed below), so overlap is free — gaps are not.
    const since = new Date(now.getTime() - 26 * 60 * 60 * 1000);

    const avatars = await prisma.centreAvatar.findMany({
      select: { id: true, serviceId: true, service: { select: { code: true } } },
    });
    const avatarByServiceId = new Map(avatars.map((a) => [a.serviceId, a.id]));
    const avatarByServiceCode = new Map(
      avatars.map((a) => [a.service.code, a.id]),
    );

    let npsHarvested = 0;
    let quickHarvested = 0;
    let parentHarvested = 0;
    let skippedNoAvatar = 0;
    let skippedNoContent = 0;

    // ---------- NPS responses ----------
    const npsRows = await prisma.npsSurveyResponse.findMany({
      where: { respondedAt: { gte: since } },
      select: {
        id: true,
        serviceId: true,
        score: true,
        category: true,
        comment: true,
        respondedAt: true,
      },
    });
    for (const row of npsRows) {
      const avatarId = avatarByServiceId.get(row.serviceId);
      if (!avatarId) {
        skippedNoAvatar += 1;
        continue;
      }
      const comment = row.comment?.trim();
      if (!comment) {
        skippedNoContent += 1;
        continue;
      }
      const source =
        row.category === "detractor"
          ? "complaint"
          : row.category === "promoter"
            ? "compliment"
            : "parent_feedback";
      const created = await safeCreateInsight({
        centreAvatarId: avatarId,
        occurredAt: row.respondedAt,
        source,
        insight: `NPS ${row.score}/10: ${comment}`,
        harvestedFrom: "nps_survey_response",
        sourceRecordId: row.id,
      });
      if (created) npsHarvested += 1;
    }

    // ---------- Quick feedback ----------
    const quickRows = await prisma.quickFeedback.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        serviceId: true,
        score: true,
        comment: true,
        createdAt: true,
      },
    });
    for (const row of quickRows) {
      const avatarId = avatarByServiceId.get(row.serviceId);
      if (!avatarId) {
        skippedNoAvatar += 1;
        continue;
      }
      const comment = row.comment?.trim();
      if (!comment) {
        skippedNoContent += 1;
        continue;
      }
      const source =
        row.score <= 2 ? "complaint" : row.score >= 4 ? "compliment" : "parent_feedback";
      const created = await safeCreateInsight({
        centreAvatarId: avatarId,
        occurredAt: row.createdAt,
        source,
        insight: `Quick feedback ${row.score}/5: ${comment}`,
        harvestedFrom: "quick_feedback",
        sourceRecordId: row.id,
      });
      if (created) quickHarvested += 1;
    }

    // ---------- Parent feedback (quarterly survey, complaints, etc.) ----------
    const parentRows = await prisma.parentFeedback.findMany({
      where: { submittedAt: { gte: since } },
      select: {
        id: true,
        serviceId: true,
        serviceCode: true,
        surveyType: true,
        sentiment: true,
        comments: true,
        submittedAt: true,
      },
    });
    for (const row of parentRows) {
      const avatarId =
        (row.serviceId && avatarByServiceId.get(row.serviceId)) ||
        avatarByServiceCode.get(row.serviceCode);
      if (!avatarId) {
        skippedNoAvatar += 1;
        continue;
      }
      const comment = row.comments?.trim();
      if (!comment) {
        skippedNoContent += 1;
        continue;
      }
      const source =
        row.surveyType === "complaint"
          ? "complaint"
          : row.surveyType === "compliment"
            ? "compliment"
            : row.surveyType === "exit_survey"
              ? "exit_conversation"
              : row.sentiment === "negative"
                ? "complaint"
                : row.sentiment === "positive"
                  ? "compliment"
                  : "parent_feedback";
      const created = await safeCreateInsight({
        centreAvatarId: avatarId,
        occurredAt: row.submittedAt,
        source,
        insight: `${row.surveyType}: ${comment}`,
        harvestedFrom: "parent_feedback",
        sourceRecordId: row.id,
      });
      if (created) parentHarvested += 1;
    }

    const totals = {
      npsHarvested,
      quickHarvested,
      parentHarvested,
      skippedNoAvatar,
      skippedNoContent,
      total: npsHarvested + quickHarvested + parentHarvested,
    };
    logger.info("Centre Avatar insights harvest completed", totals);
    await guard.complete(totals);
    return NextResponse.json(totals);
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});

type InsightSource =
  | "coordinator_checkin"
  | "parent_conversation"
  | "parent_feedback"
  | "complaint"
  | "compliment"
  | "social_comment_or_dm"
  | "whatsapp_message"
  | "enrolment_conversation"
  | "exit_conversation"
  | "other";

type HarvestSource = "nps_survey_response" | "quick_feedback" | "parent_feedback" | "manual";

async function safeCreateInsight(params: {
  centreAvatarId: string;
  occurredAt: Date;
  source: InsightSource;
  insight: string;
  harvestedFrom: HarvestSource;
  sourceRecordId: string;
}): Promise<boolean> {
  try {
    await prisma.centreAvatarInsight.create({
      data: {
        centreAvatarId: params.centreAvatarId,
        occurredAt: params.occurredAt,
        source: params.source,
        insight: params.insight.slice(0, 5000),
        status: "pending_review",
        harvestedFrom: params.harvestedFrom,
        sourceRecordId: params.sourceRecordId,
      },
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Already harvested — idempotent skip.
      return false;
    }
    logger.error("harvest-centre-avatar-insights: create failed", {
      err,
      harvestedFrom: params.harvestedFrom,
      sourceRecordId: params.sourceRecordId,
    });
    return false;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as Prisma.PrismaClientKnownRequestError).code === "P2002"
  );
}
