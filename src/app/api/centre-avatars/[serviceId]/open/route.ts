import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

type RouteCtx = { params: Promise<{ serviceId: string }> };

/**
 * POST /api/centre-avatars/[serviceId]/open
 *
 * Stamps `lastOpenedAt = now()` and `lastOpenedById = session.user.id`. The
 * frontend fires this on mount of the detail page. Campaign creation gate
 * checks these fields to decide whether the Avatar has been reviewed recently.
 */
export const POST = withApiAuth(
  async (_req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;
    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      select: { id: true },
    });
    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    await prisma.centreAvatar.update({
      where: { id: avatar.id },
      data: {
        lastOpenedAt: new Date(),
        lastOpenedById: session.user.id,
      },
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["marketing", "owner", "admin", "head_office"] },
);
