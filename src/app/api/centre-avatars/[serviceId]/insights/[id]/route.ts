import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { appendUpdateLog } from "@/lib/centre-avatar/update-log";

type RouteCtx = { params: Promise<{ serviceId: string; id: string }> };

const patchSchema = z.object({
  occurredAt: z.coerce.date().optional(),
  source: z
    .enum([
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
    ])
    .optional(),
  insight: z.string().min(1).max(5000).optional(),
  impactOnAvatar: z.string().max(5000).nullable().optional(),
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { serviceId, id } = await (context as unknown as RouteCtx).params;

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid insight patch", parsed.error.flatten());
    }

    const insight = await prisma.centreAvatarInsight.findUnique({
      where: { id },
      include: { centreAvatar: { select: { id: true, serviceId: true } } },
    });
    if (!insight || insight.centreAvatar.serviceId !== serviceId) {
      throw ApiError.notFound("Insight not found for that service");
    }

    await prisma.$transaction(async (tx) => {
      await tx.centreAvatarInsight.update({
        where: { id },
        data: parsed.data,
      });
      await appendUpdateLog(tx, {
        centreAvatarId: insight.centreAvatar.id,
        userId: session.user.id,
        sectionsChanged: ["insights"],
        summary: "Edited insight",
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
