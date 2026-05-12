import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  canViewScorecard,
  isScorecardParticipant,
} from "@/lib/scorecard-permissions";

/**
 * Service-scoped scorecard endpoint.
 *
 * Post-Bucket-O Stage 2 (PR #95): the generic `/api/measurables` POST no
 * longer accepts `serviceId` (column survives for historical rollup but
 * new rows never set it). This route is the service-detail tab's
 * dedicated create surface — it scopes measurables to a per-service
 * scorecard, which is auto-created the first time someone adds a
 * measurable from the service tab.
 *
 * GET — returns measurables filtered by `serviceId` (historical column
 *       is the source of truth for "what shows up in the service tab",
 *       even now that new measurables get a scorecardId as well).
 * POST — creates a measurable on the service's auto-managed scorecard
 *        and sets `serviceId` so it shows up in the GET above.
 */

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

function ensureServiceAccess(
  role: string,
  userServiceId: string | null | undefined,
  serviceId: string,
) {
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

// GET /api/services/[id]/scorecard — measurables for a service with trailing entries
export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  ensureServiceAccess(session!.user.role, session!.user.serviceId, id);

  const measurables = await prisma.measurable.findMany({
    where: { serviceId: id },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      entries: {
        orderBy: { weekOf: "desc" },
        take: 13,
        include: {
          enteredBy: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ ownerId: "asc" }, { title: "asc" }],
  });

  return NextResponse.json(measurables);
});

const createMeasurableSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  ownerId: z.string().min(1, "Owner is required"),
  goalValue: z.number(),
  goalDirection: z.enum(["above", "below", "exact"]),
  unit: z.string().optional().nullable(),
  frequency: z.enum(["weekly", "monthly"]).optional(),
});

/**
 * Find or auto-create the service's scorecard. We tag it via the title
 * ("Service Scorecard — <name>") because the schema doesn't (yet) have
 * a `serviceId` column on `Scorecard` — that's a future tightening
 * once we're confident the per-service tab is the canonical surface
 * (vs the org-wide /scorecard page).
 *
 * Ownership goes to the service's named manager if set, falling back
 * to the first creator. The creator is automatically a member (the
 * relation is upserted) so subsequent loads pass the participant check.
 */
async function findOrCreateServiceScorecard(
  serviceId: string,
  creatorId: string,
) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true, managerId: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  const title = `Service Scorecard — ${service.name}`;

  // The service's centre manager (if linked) becomes the scorecard
  // owner. Otherwise the first caller owns it. Either way we make sure
  // the caller is a member so they can see their own measurables.
  const desiredOwnerId = service.managerId ?? creatorId;

  const existing = await prisma.scorecard.findFirst({
    where: { title },
    select: { id: true, ownerId: true, members: { select: { userId: true } } },
  });

  if (existing) {
    // Ensure caller is a member (idempotent — unique constraint covers
    // the race). Skip if they're already the owner.
    if (
      existing.ownerId !== creatorId &&
      !existing.members.some((m) => m.userId === creatorId)
    ) {
      await prisma.scorecardMember.upsert({
        where: {
          scorecardId_userId: { scorecardId: existing.id, userId: creatorId },
        },
        update: {},
        create: { scorecardId: existing.id, userId: creatorId },
      });
      // Reflect the upsert in the in-memory copy so the downstream
      // permission check sees the freshly-added member.
      existing.members = [...existing.members, { userId: creatorId }];
    }
    return existing;
  }

  const created = await prisma.scorecard.create({
    data: {
      title,
      ownerId: desiredOwnerId,
      members:
        desiredOwnerId === creatorId
          ? undefined
          : { create: { userId: creatorId } },
    },
    select: { id: true, ownerId: true, members: { select: { userId: true } } },
  });
  return created;
}

// POST /api/services/[id]/scorecard — create a measurable for this service
//
// 2026-04-30: opened up to coordinator + member for service-level scorecard
// creation from inside the /services/[id] EOS tab.
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    ensureServiceAccess(session!.user.role, session!.user.serviceId, id);

    const body = await parseJsonBody(req);
    const parsed = createMeasurableSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    const scorecard = await findOrCreateServiceScorecard(id, session!.user.id);
    const memberIds = scorecard.members.map((m) => m.userId);
    const viewer = { id: session!.user.id, role: session!.user.role };

    // Defensive: the auto-create flow above already makes the caller a
    // participant, but be explicit so a future refactor doesn't silently
    // bypass the check.
    if (!canViewScorecard(viewer, scorecard, memberIds)) {
      throw ApiError.forbidden("You don't have access to this scorecard");
    }
    if (!isScorecardParticipant(parsed.data.ownerId, scorecard, memberIds)) {
      // The owner picker in the UI is already restricted to service
      // members. If a caller hand-rolls a request with a non-member
      // ownerId, refuse — they would have lost access to the row
      // immediately anyway.
      throw ApiError.badRequest(
        "Measurable owner must be a member of this service.",
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
        serviceId: id,
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
        details: {
          title: measurable.title,
          scorecardId: scorecard.id,
          serviceId: id,
        },
      },
    });

    return NextResponse.json(measurable, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
