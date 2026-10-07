/**
 * GET    /api/scorecards/[id] — full scorecard (gated by canView)
 * PATCH  /api/scorecards/[id] — rename / set state (gated by canManage)
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
import { AUSTRALIAN_STATES } from "@/lib/service-scope";

const patchSchema = z
  .object({
    title: z.string().min(1).max(100).optional(),
    // The state this scorecard reports on; null clears it. State Managers
    // for that state see it automatically (scorecard-permissions.ts).
    state: z
      .enum(AUSTRALIAN_STATES.map((s) => s.value) as [string, ...string[]])
      .nullable()
      .optional(),
  })
  .refine((d) => d.title !== undefined || d.state !== undefined, {
    message: "Nothing to update",
  });

async function loadScorecardWithMembers(id: string) {
  return prisma.scorecard.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      ownerId: true,
      state: true,
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

  const viewer = { id: session!.user.id, role: session!.user.role, state: session!.user.state };
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

  const viewer = { id: session!.user.id, role: session!.user.role, state: session!.user.state };
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
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
      ...(parsed.data.state !== undefined ? { state: parsed.data.state } : {}),
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      state: true,
      updatedAt: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: parsed.data.state !== undefined ? "scorecard.update" : "scorecard.rename",
      entityType: "Scorecard",
      entityId: id,
      details: {
        from: scorecard.title,
        to: updated.title,
        ...(parsed.data.state !== undefined ? { state: updated.state } : {}),
      },
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withApiAuth(async (_req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const scorecard = await loadScorecardWithMembers(id);
  if (!scorecard) throw ApiError.notFound("Scorecard not found");

  const viewer = { id: session!.user.id, role: session!.user.role, state: session!.user.state };
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
