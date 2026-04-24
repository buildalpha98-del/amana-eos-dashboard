import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { appendUpdateLog } from "@/lib/centre-avatar/update-log";

type RouteCtx = { params: Promise<{ serviceId: string; id: string }> };

const approveSchema = z
  .object({
    impactOnAvatar: z.string().max(5000).optional().nullable(),
  })
  .partial();

/**
 * POST /api/centre-avatars/[serviceId]/insights/[id]/approve
 *
 * Moves a harvested insight from `pending_review` → `approved`. Accepts an
 * optional impactOnAvatar field Akram can fill in at approval time.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { serviceId, id } = await (context as unknown as RouteCtx).params;

    const raw = await parseJsonBody(req).catch(() => ({}));
    const parsed = approveSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid approve payload", parsed.error.flatten());
    }

    const insight = await prisma.centreAvatarInsight.findUnique({
      where: { id },
      include: { centreAvatar: { select: { id: true, serviceId: true } } },
    });
    if (!insight || insight.centreAvatar.serviceId !== serviceId) {
      throw ApiError.notFound("Insight not found for that service");
    }
    if (insight.status === "approved") {
      return NextResponse.json({ ok: true, alreadyApproved: true });
    }

    await prisma.$transaction(async (tx) => {
      await tx.centreAvatarInsight.update({
        where: { id },
        data: {
          status: "approved",
          impactOnAvatar:
            parsed.data.impactOnAvatar !== undefined
              ? parsed.data.impactOnAvatar
              : insight.impactOnAvatar,
        },
      });
      await appendUpdateLog(tx, {
        centreAvatarId: insight.centreAvatar.id,
        userId: session.user.id,
        sectionsChanged: ["insights"],
        summary: "Approved harvested insight",
      });
      await tx.centreAvatar.update({
        where: { id: insight.centreAvatar.id },
        data: { lastUpdatedAt: new Date(), lastUpdatedById: session.user.id },
      });
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["marketing", "owner"] },
);
