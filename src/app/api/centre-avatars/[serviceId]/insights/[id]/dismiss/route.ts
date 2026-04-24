import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { appendUpdateLog } from "@/lib/centre-avatar/update-log";

type RouteCtx = { params: Promise<{ serviceId: string; id: string }> };

/**
 * POST /api/centre-avatars/[serviceId]/insights/[id]/dismiss
 *
 * Marks a harvested insight as dismissed — hidden from the default Insights
 * Log view but preserved for audit. Soft action, no row deletion.
 */
export const POST = withApiAuth(
  async (_req, session, context) => {
    const { serviceId, id } = await (context as unknown as RouteCtx).params;

    const insight = await prisma.centreAvatarInsight.findUnique({
      where: { id },
      include: { centreAvatar: { select: { id: true, serviceId: true } } },
    });
    if (!insight || insight.centreAvatar.serviceId !== serviceId) {
      throw ApiError.notFound("Insight not found for that service");
    }
    if (insight.status === "dismissed") {
      return NextResponse.json({ ok: true, alreadyDismissed: true });
    }

    await prisma.$transaction(async (tx) => {
      await tx.centreAvatarInsight.update({
        where: { id },
        data: { status: "dismissed" },
      });
      await appendUpdateLog(tx, {
        centreAvatarId: insight.centreAvatar.id,
        userId: session.user.id,
        sectionsChanged: ["insights"],
        summary: "Dismissed harvested insight",
      });
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["marketing", "owner"] },
);
