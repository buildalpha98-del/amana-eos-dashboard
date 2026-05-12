/**
 * GET    /api/scorecards/[id] — full scorecard (gated by canView)
 * PATCH  /api/scorecards/[id] — rename (gated by canManage)
 * DELETE /api/scorecards/[id] — delete (gated by canManage)
 *
 * Stage 2 of the scorecard overhaul (Bucket O).
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

const patchSchema = z.object({
  title: z.string().min(1).max(100),
});

async function loadScorecardWithMembers(id: string) {
  return prisma.scorecard.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      members: { select: { userId: true } },
    },
  });
}

export const GET = withApiAuth(async (_req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const scorecard = await loadScorecardWithMembers(id);
  if (!scorecard) throw ApiError.notFound("Scorecard not found");

  const viewer = { id: session!.user.id, role: session!.user.role };
  const memberIds = scorecard.members.map((m) => m.userId);
  if (!canViewScorecard(viewer, scorecard, memberIds)) {
    throw ApiError.forbidden("You don't have access to this scorecard");
  }

  // Load full payload (measurables + entries) since the caller is
  // entitled to see it. Mirrors the singleton `/api/scorecard` shape.
  const full = await prisma.scorecard.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
      },
      measurables: {
        include: {
          owner: {
            select: { id: true, name: true, email: true, avatar: true },
          },
          rock: { select: { id: true, title: true } },
          entries: {
            orderBy: { weekOf: "desc" },
            take: 13,
            include: { enteredBy: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      },
    },
  });

  return NextResponse.json(full);
});

export const PATCH = withApiAuth(async (req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const scorecard = await loadScorecardWithMembers(id);
  if (!scorecard) throw ApiError.notFound("Scorecard not found");

  const viewer = { id: session!.user.id, role: session!.user.role };
  if (!canManageScorecard(viewer, scorecard)) {
    throw ApiError.forbidden("Only the owner can edit this scorecard");
  }

  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0].message);
  }

  const updated = await prisma.scorecard.update({
    where: { id },
    data: { title: parsed.data.title.trim() },
    select: {
      id: true,
      title: true,
      ownerId: true,
      updatedAt: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "scorecard.rename",
      entityType: "Scorecard",
      entityId: id,
      details: { from: scorecard.title, to: updated.title },
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withApiAuth(async (_req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const scorecard = await loadScorecardWithMembers(id);
  if (!scorecard) throw ApiError.notFound("Scorecard not found");

  const viewer = { id: session!.user.id, role: session!.user.role };
  if (!canManageScorecard(viewer, scorecard)) {
    throw ApiError.forbidden("Only the owner can delete this scorecard");
  }

  // CASCADE drops members + measurables + entries automatically.
  await prisma.scorecard.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "scorecard.delete",
      entityType: "Scorecard",
      entityId: id,
      details: { title: scorecard.title },
    },
  });

  return NextResponse.json({ ok: true });
});
