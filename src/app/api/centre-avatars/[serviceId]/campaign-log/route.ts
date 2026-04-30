import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { appendUpdateLog } from "@/lib/centre-avatar/update-log";

type RouteCtx = { params: Promise<{ serviceId: string }> };

const campaignLogSchema = z.object({
  occurredAt: z.coerce.date(),
  campaignName: z.string().min(1).max(300),
  contentUsed: z.string().max(4000).optional().nullable(),
  result: z.string().max(4000).optional().nullable(),
  learnings: z.string().max(4000).optional().nullable(),
  marketingCampaignId: z.string().optional().nullable(),
});

/**
 * POST /api/centre-avatars/[serviceId]/campaign-log
 *
 * Adds a campaign-history entry to the Avatar. Optionally links to the
 * canonical `MarketingCampaign` record.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;

    const raw = await parseJsonBody(req);
    const parsed = campaignLogSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid campaign-log payload", parsed.error.flatten());
    }

    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      select: { id: true },
    });
    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    if (parsed.data.marketingCampaignId) {
      const exists = await prisma.marketingCampaign.findUnique({
        where: { id: parsed.data.marketingCampaignId },
        select: { id: true },
      });
      if (!exists) throw ApiError.badRequest("Linked marketingCampaignId does not exist");
    }

    const log = await prisma.$transaction(async (tx) => {
      const row = await tx.centreAvatarCampaignLog.create({
        data: {
          centreAvatarId: avatar.id,
          occurredAt: parsed.data.occurredAt,
          campaignName: parsed.data.campaignName,
          contentUsed: parsed.data.contentUsed ?? null,
          result: parsed.data.result ?? null,
          learnings: parsed.data.learnings ?? null,
          marketingCampaignId: parsed.data.marketingCampaignId ?? null,
          createdById: session.user.id,
        },
      });
      await appendUpdateLog(tx, {
        centreAvatarId: avatar.id,
        userId: session.user.id,
        sectionsChanged: ["campaignLog"],
        summary: `Added campaign: ${parsed.data.campaignName}`,
      });
      await tx.centreAvatar.update({
        where: { id: avatar.id },
        data: { lastUpdatedAt: new Date(), lastUpdatedById: session.user.id },
      });
      return row;
    });

    return NextResponse.json({ log });
  },
  { roles: ["marketing", "owner"] },
);
