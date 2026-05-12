/**
 * GET  /api/scorecards/[id]/members — list members (canView)
 * POST /api/scorecards/[id]/members — invite a user (canManage)
 *
 * Stage 2 of the scorecard overhaul (Bucket O). The owner record
 * itself isn't stored in ScorecardMember — they're implicitly a
 * participant via `Scorecard.ownerId`. Members listed here are
 * the additional invitees.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  canViewScorecard,
  canManageScorecard,
} from "@/lib/scorecard-permissions";

const inviteSchema = z.object({
  userId: z.string().min(1, "userId is required"),
});

async function loadScorecardCore(id: string) {
  return prisma.scorecard.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      members: { select: { userId: true } },
    },
  });
}

export const GET = withApiAuth(async (_req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const sc = await loadScorecardCore(id);
  if (!sc) throw ApiError.notFound("Scorecard not found");

  const viewer = { id: session!.user.id, role: session!.user.role };
  const memberIds = sc.members.map((m) => m.userId);
  if (!canViewScorecard(viewer, sc, memberIds)) {
    throw ApiError.forbidden("You don't have access to this scorecard");
  }

  const members = await prisma.scorecardMember.findMany({
    where: { scorecardId: id },
    select: {
      id: true,
      addedAt: true,
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
    orderBy: { addedAt: "asc" },
  });

  return NextResponse.json({ members });
});

export const POST = withApiAuth(async (req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const sc = await loadScorecardCore(id);
  if (!sc) throw ApiError.notFound("Scorecard not found");

  const viewer = { id: session!.user.id, role: session!.user.role };
  if (!canManageScorecard(viewer, sc)) {
    throw ApiError.forbidden("Only the owner can invite members");
  }

  const body = await parseJsonBody(req);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0].message);
  }
  const { userId } = parsed.data;

  if (userId === sc.ownerId) {
    throw ApiError.badRequest("The owner is already a participant");
  }

  // Existence check — give a clearer error than the FK violation.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, active: true, name: true, email: true, avatar: true },
  });
  if (!user) throw ApiError.notFound("User not found");
  if (!user.active) {
    throw ApiError.badRequest("Cannot invite a deactivated user");
  }

  // Idempotent — duplicate invite returns the existing row.
  const existing = await prisma.scorecardMember.findUnique({
    where: { scorecardId_userId: { scorecardId: id, userId } },
    select: { id: true, addedAt: true },
  });
  if (existing) {
    return NextResponse.json(
      { member: { id: existing.id, addedAt: existing.addedAt, user } },
      { status: 200 },
    );
  }

  const member = await prisma.scorecardMember.create({
    data: { scorecardId: id, userId },
    select: { id: true, addedAt: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "scorecard.invite",
      entityType: "Scorecard",
      entityId: id,
      details: { invitedUserId: userId },
    },
  });

  return NextResponse.json(
    { member: { ...member, user } },
    { status: 201 },
  );
});
