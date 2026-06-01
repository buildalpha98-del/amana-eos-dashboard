/**
 * GET /api/users/[id]/position-description
 *   Returns the user's current PD assignment (or null).
 *
 * PUT /api/users/[id]/position-description
 *   Body: { positionDescriptionId: string | null }
 *   Assigns (or clears) the position description on a User. Admin-only.
 *
 * Visibility on GET:
 *   - admin / owner / head_office: any user
 *   - the user themselves: their own assignment
 *   - everyone else: 403
 *
 * Why a dedicated endpoint instead of folding into /api/users/[id]:
 *   - Activity-log audit trail is cleaner (one action, one row)
 *   - We can validate the target PD is published (not draft/archived)
 *   - Future: notify the staff member when their PD changes
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  positionDescriptionId: z.string().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

export const GET = withApiAuth(async (_req, session, context) => {
  const { id: targetUserId } = await (context as unknown as RouteContext).params;
  const role = session!.user.role;
  const callerId = session!.user.id;

  if (!ADMIN_ROLES.has(role) && callerId !== targetUserId) {
    throw ApiError.forbidden();
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      positionDescriptionId: true,
      positionDescriptionAssignedAt: true,
      positionDescription: true,
    },
  });
  if (!user) throw ApiError.notFound("User not found");

  // Hide drafts from non-admin readers (admin assigning by mistake).
  const pd = user.positionDescription;
  const visiblePd =
    pd && pd.status === "draft" && !ADMIN_ROLES.has(role) ? null : pd;

  return NextResponse.json({
    positionDescriptionId: user.positionDescriptionId,
    positionDescriptionAssignedAt: user.positionDescriptionAssignedAt,
    positionDescription: visiblePd,
  });
});

export const PUT = withApiAuth(
  async (req, session, context) => {
    const { id: targetUserId } = await (context as unknown as RouteContext)
      .params;

    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const { positionDescriptionId } = parsed.data;

    // Confirm the user exists.
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, positionDescriptionId: true },
    });
    if (!target) throw ApiError.notFound("User not found");

    // If assigning (not clearing), confirm the PD exists + is published.
    // Assigning a draft is forbidden — staff would see "null" anyway
    // because the GET endpoint hides drafts; reject explicitly to
    // surface the misconfiguration loudly to admin.
    if (positionDescriptionId) {
      const pd = await prisma.positionDescription.findUnique({
        where: { id: positionDescriptionId },
        select: { id: true, title: true, status: true },
      });
      if (!pd) throw ApiError.notFound("Position description not found");
      if (pd.status !== "published") {
        throw ApiError.badRequest(
          `Cannot assign a ${pd.status} position description. Publish it first.`,
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        positionDescriptionId,
        positionDescriptionAssignedAt: positionDescriptionId
          ? new Date()
          : null,
      },
      select: {
        id: true,
        positionDescriptionId: true,
        positionDescriptionAssignedAt: true,
        positionDescription: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: positionDescriptionId
          ? "position_description_assigned"
          : "position_description_unassigned",
        entityType: "User",
        entityId: targetUserId,
        details: {
          previousPdId: target.positionDescriptionId,
          newPdId: positionDescriptionId,
        },
      },
    });

    logger.info("Position description assignment changed", {
      targetUserId,
      previousPdId: target.positionDescriptionId,
      newPdId: positionDescriptionId,
      actorId: session!.user.id,
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
