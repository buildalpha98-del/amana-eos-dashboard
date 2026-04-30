import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { appendUpdateLog } from "@/lib/centre-avatar/update-log";

type RouteCtx = { params: Promise<{ serviceId: string }> };

const manualInsightSchema = z.object({
  occurredAt: z.coerce.date(),
  source: z.enum([
    "coordinator_checkin",
    "parent_conversation",
    "parent_feedback",
    "complaint",
    "compliment",
    "social_comment_or_dm",
    "whatsapp_message",
    "enrolment_conversation",
    "exit_conversation",
    "other",
  ]),
  insight: z.string().min(1).max(5000),
  impactOnAvatar: z.string().max(5000).optional().nullable(),
});

/**
 * POST /api/centre-avatars/[serviceId]/insights
 *
 * Manual insight entry. Created with `status: approved` (harvested inserts
 * happen in the cron and start as `pending_review`).
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;

    const raw = await parseJsonBody(req);
    const parsed = manualInsightSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid insight payload", parsed.error.flatten());
    }

    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      select: { id: true },
    });
    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    const insight = await prisma.$transaction(async (tx) => {
      const row = await tx.centreAvatarInsight.create({
        data: {
          centreAvatarId: avatar.id,
          occurredAt: parsed.data.occurredAt,
          source: parsed.data.source,
          insight: parsed.data.insight,
          impactOnAvatar: parsed.data.impactOnAvatar ?? null,
          status: "approved",
          harvestedFrom: "manual",
          createdById: session.user.id,
        },
      });
      await appendUpdateLog(tx, {
        centreAvatarId: avatar.id,
        userId: session.user.id,
        sectionsChanged: ["insights"],
        summary: `Added insight (${parsed.data.source})`,
      });
      await tx.centreAvatar.update({
        where: { id: avatar.id },
        data: { lastUpdatedAt: new Date(), lastUpdatedById: session.user.id },
      });
      return row;
    });

    return NextResponse.json({ insight });
  },
  { roles: ["marketing", "owner"] },
);
