import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

type RouteCtx = { params: Promise<{ serviceId: string }> };

/**
 * POST /api/centre-avatars/[serviceId]/mark-reviewed
 *
 * Stamps the "reviewed with Jayden" moment. Updates `lastFullReviewAt`,
 * `lastReviewedAt` and `lastReviewedById` in a single write.
 */
export const POST = withApiAuth(
  async (_req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;
    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      select: { id: true },
    });
    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    const now = new Date();
    await prisma.$transaction([
      prisma.centreAvatar.update({
        where: { id: avatar.id },
        data: {
          lastReviewedAt: now,
          lastReviewedById: session.user.id,
          lastFullReviewAt: now,
        },
      }),
      prisma.centreAvatarUpdateLog.create({
        data: {
          centreAvatarId: avatar.id,
          occurredAt: now,
          sectionsChanged: ["review"],
          summary: "Marked as reviewed in 1:1",
          updatedById: session.user.id,
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  },
  { roles: ["marketing", "owner"] },
);
