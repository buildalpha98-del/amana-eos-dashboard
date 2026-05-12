/**
 * DELETE /api/scorecards/[id]/members/[userId] — remove a member
 *
 * Owner / dashboard-owner only. Removing yourself is allowed and is
 * the only way to leave a scorecard you're not the owner of —
 * useful when you no longer want notifications from it.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { canManageScorecard } from "@/lib/scorecard-permissions";

export const DELETE = withApiAuth(async (
  _req: NextRequest,
  session,
  context,
) => {
  const { id, userId } = await context!.params! as {
    id: string;
    userId: string;
  };

  const sc = await prisma.scorecard.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!sc) throw ApiError.notFound("Scorecard not found");

  const viewer = { id: session!.user.id, role: session!.user.role };
  const isSelfRemoval = session!.user.id === userId;

  // Owner-managed removal OR self-removal. A regular member can
  // remove themselves; anyone else needs manage rights.
  if (!isSelfRemoval && !canManageScorecard(viewer, sc)) {
    throw ApiError.forbidden(
      "Only the owner can remove other members; you can only remove yourself",
    );
  }

  if (userId === sc.ownerId) {
    throw ApiError.badRequest(
      "Cannot remove the scorecard owner. Transfer ownership first or delete the scorecard.",
    );
  }

  await prisma.scorecardMember
    .delete({
      where: { scorecardId_userId: { scorecardId: id, userId } },
    })
    .catch(() => {
      // Already absent — treat as success (idempotent).
    });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "scorecard.remove_member",
      entityType: "Scorecard",
      entityId: id,
      details: { removedUserId: userId, selfRemoval: isSelfRemoval },
    },
  });

  return NextResponse.json({ ok: true });
});
