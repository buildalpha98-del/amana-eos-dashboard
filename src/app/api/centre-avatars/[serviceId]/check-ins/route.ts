import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { appendUpdateLog } from "@/lib/centre-avatar/update-log";

type RouteCtx = { params: Promise<{ serviceId: string }> };

const checkInSchema = z.object({
  occurredAt: z.coerce.date(),
  topicsDiscussed: z.string().min(1).max(5000),
  actionItems: z.string().max(5000).optional().nullable(),
  followUpDate: z.coerce.date().optional().nullable(),
  coordinatorUserId: z.string().optional().nullable(),
});

/**
 * POST /api/centre-avatars/[serviceId]/check-ins
 *
 * Logs a coordinator check-in against the Avatar.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;

    // Coordinators can only log check-ins for their own service.
    if (
      session.user.role === "member" &&
      session.user.serviceId !== serviceId
    ) {
      throw ApiError.forbidden(
        "Coordinators can only log check-ins for their own centre",
      );
    }

    const raw = await parseJsonBody(req);
    const parsed = checkInSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid check-in payload", parsed.error.flatten());
    }

    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      select: { id: true },
    });
    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.centreAvatarCoordinatorCheckIn.create({
        data: {
          centreAvatarId: avatar.id,
          occurredAt: parsed.data.occurredAt,
          topicsDiscussed: parsed.data.topicsDiscussed,
          actionItems: parsed.data.actionItems ?? null,
          followUpDate: parsed.data.followUpDate ?? null,
          coordinatorUserId: parsed.data.coordinatorUserId ?? null,
          createdById: session.user.id,
        },
      });
      await appendUpdateLog(tx, {
        centreAvatarId: avatar.id,
        userId: session.user.id,
        sectionsChanged: ["coordinatorCheckIns"],
        summary: "Logged coordinator check-in",
      });
      await tx.centreAvatar.update({
        where: { id: avatar.id },
        data: { lastUpdatedAt: new Date(), lastUpdatedById: session.user.id },
      });
      return created;
    });

    return NextResponse.json({ checkIn: row });
  },
  { roles: ["marketing", "owner", "member"] },
);
