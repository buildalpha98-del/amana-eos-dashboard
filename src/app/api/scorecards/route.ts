/**
 * GET /api/scorecards — list scorecards the viewer can see
 * POST /api/scorecards — create a new scorecard (caller becomes owner)
 *
 * Visibility rules from src/lib/scorecard-permissions.ts:
 *   - dashboard owner sees everything
 *   - per-scorecard owner sees their own
 *   - members see scorecards they were invited to
 *
 * Stage 2 of the Bucket O overhaul. The singleton `/api/scorecard`
 * endpoint stays put for now — Stage 3 UI will migrate over and the
 * old endpoint becomes orphaned for later cleanup.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const createScorecardSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
});

export const GET = withApiAuth(async (_req: NextRequest, session) => {
  const viewerId = session!.user.id;
  const viewerRole = session!.user.role;

  // Dashboard owner gets every scorecard. Everyone else only sees
  // scorecards where they are the per-scorecard owner OR a member.
  const where =
    viewerRole === "owner"
      ? {}
      : {
          OR: [
            { ownerId: viewerId },
            { members: { some: { userId: viewerId } } },
          ],
        };

  const scorecards = await prisma.scorecard.findMany({
    where,
    select: {
      id: true,
      title: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      _count: { select: { measurables: true, members: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ scorecards });
});

export const POST = withApiAuth(async (req: NextRequest, session) => {
  const body = await parseJsonBody(req);
  const parsed = createScorecardSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0].message);
  }

  const scorecard = await prisma.scorecard.create({
    data: {
      title: parsed.data.title.trim(),
      ownerId: session!.user.id,
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      _count: { select: { measurables: true, members: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "scorecard.create",
      entityType: "Scorecard",
      entityId: scorecard.id,
      details: { title: scorecard.title },
    },
  });

  return NextResponse.json(scorecard, { status: 201 });
});
