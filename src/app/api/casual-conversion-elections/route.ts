/**
 * GET  /api/casual-conversion-elections?userId=X
 *      Returns the user's election history (most-recent first) + the
 *      current eligibility verdict. Admin / owner / head_office only.
 *
 * POST /api/casual-conversion-elections
 *      Records a new election. Validates the requester is eligible
 *      via `computeEligibility` BEFORE writing — prevents a casual
 *      who's mid-decline-cooldown from being double-elected by an
 *      admin who didn't realise.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { computeEligibility } from "@/lib/casual-conversion";

const createSchema = z.object({
  userId: z.string().min(1),
  requestedType: z.enum(["part_time", "full_time"]),
  // When the employee actually elected — admin may be recording an
  // election that happened earlier (e.g. via email yesterday).
  electedAt: z.string().datetime().optional(),
  electionNotes: z.string().max(20_000).optional().nullable(),
});

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) throw ApiError.badRequest("userId is required");

    const [elections, eligibility] = await Promise.all([
      prisma.casualConversionElection.findMany({
        where: { userId, deleted: false },
        include: {
          respondedBy: { select: { id: true, name: true } },
          newContract: {
            select: {
              id: true,
              contractType: true,
              startDate: true,
              payRate: true,
            },
          },
        },
        orderBy: { electedAt: "desc" },
      }),
      computeEligibility(userId),
    ]);

    return NextResponse.json({
      elections,
      eligibility,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const data = parsed.data;

    // Eligibility check — refuse to record an election the law doesn't
    // permit at this time. The UI is supposed to gate this too but the
    // server is the source of truth.
    const eligibility = await computeEligibility(data.userId);
    if (!eligibility.eligible) {
      const reasons: Record<typeof eligibility.reason, string> = {
        eligible: "eligible",
        not_casual:
          "This staff member isn't on a casual contract — conversion doesn't apply.",
        inactive: "This account is deactivated.",
        insufficient_tenure: `Tenure is ${eligibility.tenureMonths.toFixed(1)} months; threshold is ${eligibility.thresholdMonths} months.`,
        pending_election:
          "There's already a pending election awaiting response.",
        recent_decline_cooldown: `A previous election was declined recently. Cooldown ends ${eligibility.cooldownUntil?.toISOString().slice(0, 10) ?? "soon"}.`,
      };
      throw ApiError.badRequest(reasons[eligibility.reason]);
    }

    const subject = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true },
    });
    if (!subject) throw ApiError.notFound("User not found");

    const created = await prisma.casualConversionElection.create({
      data: {
        userId: data.userId,
        requestedType: data.requestedType,
        electedAt: data.electedAt ? new Date(data.electedAt) : new Date(),
        electionNotes: data.electionNotes ?? null,
      },
      include: {
        respondedBy: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "casual_conversion_election_created",
        entityType: "CasualConversionElection",
        entityId: created.id,
        details: {
          subjectUserId: data.userId,
          subjectName: subject.name,
          requestedType: data.requestedType,
        },
      },
    });

    logger.info("Casual conversion election recorded", {
      electionId: created.id,
      subjectUserId: data.userId,
      requestedType: data.requestedType,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
