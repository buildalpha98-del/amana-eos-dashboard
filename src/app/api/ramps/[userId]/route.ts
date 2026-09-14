import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { canAccessProfile } from "@/lib/staff/can-access-profile";
import { loadRampScorecard } from "@/lib/ramp/scorecard";
import { canReviewRamp } from "@/lib/ramp/recipients";

/**
 * GET /api/ramps/[userId] — one starter's ramp: scorecard, weekly check-ins,
 * checkpoints. Access mirrors the staff profile (self / admin tier / a
 * coordinator at the same service). 404 when the user has no ramp — the
 * profile section simply doesn't render.
 *
 * The starter sees their own ramp but NOT the manager's free-text checkpoint
 * summaries (ratings and recommendation stay visible for transparency).
 */
export const GET = withApiAuth(async (_req, session, context) => {
  const { userId } = await context!.params!;
  const viewerId = session!.user.id;
  const viewerRole = session!.user.role ?? null;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, serviceId: true, service: { select: { id: true, name: true, managerId: true } } },
  });
  if (!target) throw ApiError.notFound("User not found");
  if (!(await canAccessProfile(viewerId, viewerRole, target))) {
    throw ApiError.notFound("User not found");
  }

  const ramp = await prisma.staffRamp.findUnique({
    where: { userId },
    include: {
      checkIns: { orderBy: { weekNumber: "asc" } },
      checkpoints: {
        orderBy: { day: "asc" },
        include: { reviewer: { select: { id: true, name: true } } },
      },
    },
  });
  if (!ramp) throw ApiError.notFound("No ramp for this user");

  const isSelf = viewerId === userId;
  const canReview = !isSelf && (await canReviewRamp(prisma, { id: viewerId, role: viewerRole }, userId));
  const scorecard = await loadRampScorecard(prisma, ramp, new Date());

  return NextResponse.json({
    ramp: {
      id: ramp.id,
      status: ramp.status,
      startDate: ramp.startDate,
      endDate: ramp.endDate,
      completedAt: ramp.completedAt,
      probationReviewId: ramp.probationReviewId,
      user: { id: target.id, name: target.name, service: target.service ? { id: target.service.id, name: target.service.name } : null },
    },
    scorecard,
    checkIns: ramp.checkIns.map((c) => ({
      id: c.id,
      weekNumber: c.weekNumber,
      dueAt: c.dueAt,
      sentAt: c.sentAt,
      skipped: c.skipped,
      submittedAt: c.submittedAt,
      mood: c.mood,
      wentWell: c.wentWell,
      struggling: c.struggling,
      needsHelp: c.needsHelp,
      helpDetail: c.helpDetail,
      flaggedAt: c.flaggedAt,
    })),
    checkpoints: ramp.checkpoints.map((c) => ({
      id: c.id,
      day: c.day,
      dueAt: c.dueAt,
      sentAt: c.sentAt,
      submittedAt: c.submittedAt,
      reviewer: c.reviewer,
      ratings: c.ratings,
      summary: isSelf ? null : c.summary,
      recommendation: c.recommendation,
    })),
    permissions: { canReview, isSelf },
  });
});
