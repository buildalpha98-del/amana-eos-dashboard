import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isGateOpen } from "@/lib/centre-avatar/freshness";

type RouteCtx = { params: Promise<{ serviceId: string }> };

/**
 * GET /api/centre-avatars/[serviceId]/gate-status
 *
 * Returns whether the campaign gate is currently satisfied for the given
 * service. The gate is open when the current user has opened this service's
 * Avatar in the last 7 days.
 */
export const GET = withApiAuth(
  async (_req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;
    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      include: {
        service: { select: { id: true, name: true } },
        lastOpenedBy: { select: { id: true, name: true } },
      },
    });
    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    const open = isGateOpen(avatar.lastOpenedAt, avatar.lastOpenedById, session.user.id);

    return NextResponse.json({
      serviceId: avatar.serviceId,
      serviceName: avatar.service.name,
      open,
      lastOpenedAt: avatar.lastOpenedAt?.toISOString() ?? null,
      lastOpenedBy: avatar.lastOpenedBy?.name ?? null,
      requiresReview: !open,
    });
  },
  { roles: ["marketing", "owner", "admin", "head_office"] },
);
