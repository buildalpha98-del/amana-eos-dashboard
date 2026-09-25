/**
 * Manager checkpoint submission — the only place ramp status changes.
 *
 * Day 30/60: on_track | needs_support | at_risk (ramp stays active).
 * Day 90 and any extension checkpoint:
 *   pass   → ramp completed + probation PerformanceReview created
 *   extend → ramp extended, endDate +30, a new checkpoint at day+30
 *   end    → ramp ended
 */
import type { Prisma, PrismaClient, RampRecommendation, ReviewRating } from "@prisma/client";
import { ApiError } from "@/lib/api-error";
import { notifyUser, notifyUsers } from "@/lib/notify-user";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";
import {
  RAMP_COMPETENCIES,
  RAMP_EXTENSION_DAYS,
  RAMP_FINAL_RECOMMENDATIONS,
  RAMP_INTERIM_RECOMMENDATIONS,
  RAMP_LENGTH_DAYS,
  RAMP_RECOMMENDATION_LABELS,
  RAMP_SCORECARD_ROWS,
} from "./constants";
import { addDays, checkpointDueDate } from "./dates";
import { loadRampScorecard, ratingAverage, type RampScorecard } from "./scorecard";
import { resolveRampWatchers } from "./recipients";
import { sendRampClosedEmail } from "./emails";

type Db = PrismaClient;

export interface SubmitCheckpointInput {
  userId: string;
  day: number;
  reviewer: { id: string; name: string };
  ratings: Record<string, number>;
  summary: string | null;
  recommendation: RampRecommendation;
}

export function isFinalCheckpoint(day: number): boolean {
  return day >= RAMP_LENGTH_DAYS;
}

export function ratingToReviewRating(avg: number | null): ReviewRating | null {
  if (avg == null) return null;
  if (avg < 2) return "below_expectations";
  if (avg < 3) return "partially_meeting";
  if (avg < 4) return "meeting_expectations";
  if (avg < 4.75) return "exceeding_expectations";
  return "exceptional";
}

function formatValue(row: RampScorecard["rows"][number]): string {
  if (row.value == null) return "—";
  switch (row.format) {
    case "percent":
      return `${row.value}%`;
    case "boolean":
      return row.value ? "Yes" : "No";
    case "score":
      return `${row.value}/5`;
    default:
      return String(row.value);
  }
}

/** Plain-text assessment pre-filled into the probation review. */
export function buildProbationAssessment(
  scorecard: RampScorecard,
  ratings: Record<string, number>,
  summary: string | null,
): string {
  const lines: string[] = [];
  lines.push(`90-day ramp scorecard (day ${scorecard.day}):`);
  for (const row of scorecard.rows) {
    const def = RAMP_SCORECARD_ROWS.find((r) => r.key === row.key);
    lines.push(`- ${row.label}: ${formatValue(row)} (target ${def?.targets[90] ?? row.target}) — ${row.status}`);
  }
  lines.push("");
  lines.push("Day-90 competency ratings:");
  for (const c of RAMP_COMPETENCIES) {
    const v = ratings[c.key];
    lines.push(`- ${c.label}: ${v != null ? `${v}/5` : "—"}`);
  }
  if (summary?.trim()) {
    lines.push("");
    lines.push("Manager summary:");
    lines.push(summary.trim());
  }
  return lines.join("\n");
}

export async function submitRampCheckpoint(db: Db, input: SubmitCheckpointInput) {
  const ramp = await db.staffRamp.findUnique({
    where: { userId: input.userId },
    include: { checkIns: true, checkpoints: true, user: { select: { id: true, name: true } } },
  });
  if (!ramp) throw ApiError.notFound("No ramp for this staff member");
  if (ramp.status === "completed" || ramp.status === "ended") {
    throw ApiError.conflict("This ramp is already closed");
  }

  const checkpoint = ramp.checkpoints.find((c) => c.day === input.day);
  if (!checkpoint) throw ApiError.notFound("No such checkpoint");
  if (checkpoint.submittedAt) throw ApiError.conflict("This checkpoint has already been submitted");

  const final = isFinalCheckpoint(input.day);
  const allowed: readonly string[] = final ? RAMP_FINAL_RECOMMENDATIONS : RAMP_INTERIM_RECOMMENDATIONS;
  if (!allowed.includes(input.recommendation)) {
    throw ApiError.badRequest(
      final
        ? "Day-90 checkpoints need a probation decision: pass, extend or end"
        : "Interim checkpoints take on_track, needs_support or at_risk",
    );
  }

  const now = new Date();
  const scorecard = await loadRampScorecard(db, ramp, now);
  const avg = ratingAverage(input.ratings);

  const result = await db.$transaction(async (tx) => {
    await tx.rampCheckpoint.update({
      where: { id: checkpoint.id },
      data: {
        submittedAt: now,
        reviewerUserId: input.reviewer.id,
        ratings: input.ratings as Prisma.InputJsonValue,
        summary: input.summary,
        recommendation: input.recommendation,
      },
    });

    if (!final) {
      return { status: ramp.status, probationReviewId: null as string | null };
    }

    if (input.recommendation === "pass") {
      const review = await tx.performanceReview.create({
        data: {
          userId: ramp.userId,
          reviewerUserId: input.reviewer.id,
          createdById: input.reviewer.id,
          type: "probation",
          status: "manager_review",
          periodStart: ramp.startDate,
          periodEnd: ramp.endDate,
          dueDate: addDays(now, 7),
          managerAssessment: buildProbationAssessment(scorecard, input.ratings, input.summary),
          managerSubmittedAt: now,
          overallRating: ratingToReviewRating(avg),
        },
        select: { id: true },
      });
      await tx.staffRamp.update({
        where: { id: ramp.id },
        data: { status: "completed", completedAt: now, probationReviewId: review.id },
      });
      return { status: "completed" as const, probationReviewId: review.id };
    }

    if (input.recommendation === "extend") {
      const newEnd = addDays(ramp.endDate, RAMP_EXTENSION_DAYS);
      const nextDay = input.day + RAMP_EXTENSION_DAYS;
      await tx.staffRamp.update({
        where: { id: ramp.id },
        data: { status: "extended", endDate: newEnd },
      });
      await tx.rampCheckpoint.create({
        data: { rampId: ramp.id, day: nextDay, dueAt: checkpointDueDate(ramp.startDate, nextDay) },
      });
      await tx.user.update({ where: { id: ramp.userId }, data: { probationEndDate: newEnd } });
      return { status: "extended" as const, probationReviewId: null as string | null };
    }

    await tx.staffRamp.update({
      where: { id: ramp.id },
      data: { status: "ended", completedAt: now },
    });
    return { status: "ended" as const, probationReviewId: null as string | null };
  });

  await db.activityLog.create({
    data: {
      userId: input.reviewer.id,
      action: "ramp_checkpoint_submitted",
      entityType: "StaffRamp",
      entityId: ramp.id,
      details: { day: input.day, recommendation: input.recommendation, average: avg, probationReviewId: result.probationReviewId },
    },
  }).catch((err) => logger.error("ramp checkpoint activity log failed", { err }));

  // Fan-out — never throws.
  try {
    if (final) {
      const label = RAMP_RECOMMENDATION_LABELS[input.recommendation] ?? input.recommendation;
      if (input.recommendation === "pass") {
        await notifyUser(db, ramp.userId, {
          type: NOTIFICATION_TYPES.RAMP_COMPLETED,
          title: "You've completed your 90-day ramp",
          body: "Congratulations — your probation review has been recorded. Take a look at it in My Portal.",
          link: "/my-portal",
        });
      }
      const watchers = (await resolveRampWatchers(db, ramp.userId)).filter((w) => w.id !== input.reviewer.id);
      await notifyUsers(db, watchers.map((w) => w.id), {
        type: NOTIFICATION_TYPES.RAMP_COMPLETED,
        title: `${ramp.user.name} — 90-day ramp: ${label}`,
        body: `${input.reviewer.name} submitted the day-${input.day} checkpoint.`,
        link: `/staff/${ramp.userId}#section-ramp`,
      });
      for (const w of watchers) {
        await sendRampClosedEmail({
          to: w,
          starterName: ramp.user.name,
          starterUserId: ramp.userId,
          recommendation: input.recommendation,
          reviewerName: input.reviewer.name,
        });
      }
    }
  } catch (err) {
    logger.error("ramp checkpoint fan-out failed", { err, rampId: ramp.id });
  }

  return { ...result, average: avg };
}
