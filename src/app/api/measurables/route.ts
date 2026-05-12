import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  canViewScorecard,
  isScorecardParticipant,
} from "@/lib/scorecard-permissions";

/**
 * Stage 2 of the scorecard overhaul (Bucket O):
 *   - `scorecardId` is now required on the body
 *   - `serviceId` removed from the input schema (the column survives
 *     on existing rows for historical leadership-rollup but new rows
 *     never set it)
 *   - The route validates that:
 *       (a) the caller can VIEW the target scorecard, and
 *       (b) the `ownerId` (the measurable's owner) is a participant
 *           of that scorecard (its owner or a member)
 *   - The Stage-1 fallback that auto-created a default scorecard is
 *     removed — callers must select one explicitly
 */
const createMeasurableSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  ownerId: z.string().min(1, "Owner is required"),
  scorecardId: z.string().min(1, "Scorecard is required"),
  goalValue: z.number(),
  goalDirection: z.enum(["above", "below", "exact"]),
  unit: z.string().optional().nullable(),
  frequency: z.enum(["weekly", "monthly"]).optional(),
});

export const POST = withApiAuth(
  async (req: NextRequest, session) => {
    const body = await parseJsonBody(req);
    const parsed = createMeasurableSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    // Load the scorecard + member ids in a single round-trip so the
    // permission checks below don't issue extra queries each.
    const scorecard = await prisma.scorecard.findUnique({
      where: { id: parsed.data.scorecardId },
      select: {
        id: true,
        ownerId: true,
        members: { select: { userId: true } },
      },
    });
    if (!scorecard) throw ApiError.notFound("Scorecard not found");

    const viewer = { id: session!.user.id, role: session!.user.role };
    const memberIds = scorecard.members.map((m) => m.userId);

    if (!canViewScorecard(viewer, scorecard, memberIds)) {
      throw ApiError.forbidden("You don't have access to this scorecard");
    }

    if (!isScorecardParticipant(parsed.data.ownerId, scorecard, memberIds)) {
      throw ApiError.badRequest(
        "Measurable owner must be a member of this scorecard. Invite them first.",
      );
    }

    const measurable = await prisma.measurable.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        ownerId: parsed.data.ownerId,
        goalValue: parsed.data.goalValue,
        goalDirection: parsed.data.goalDirection,
        unit: parsed.data.unit || null,
        frequency: parsed.data.frequency || "weekly",
        scorecardId: scorecard.id,
        // Intentionally NOT setting serviceId here — Stage 2 of the
        // overhaul: scorecards are the scope, not services. Existing
        // rows keep their serviceId for historical rollup queries.
      },
      include: {
        owner: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "create",
        entityType: "Measurable",
        entityId: measurable.id,
        details: { title: measurable.title, scorecardId: scorecard.id },
      },
    });

    return NextResponse.json(measurable, { status: 201 });
  },
  // 2026-04-30: opened up to coordinator + member for service-level scorecard
  // creation from inside the /services/[id] EOS tab.
  { roles: ["owner", "head_office", "admin", "member"] },
);
