import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

/**
 * POST /api/communication/cascade/[id]/remind
 *
 * Nudge everyone who hasn't acknowledged a cascade message yet — one
 * in-app notification each. Admin-tier only, rate-limited (3/hour) so a
 * keen admin can't spam the whole org.
 */
export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;

    const cascade = await prisma.cascadeMessage.findFirst({
      where: { id, deleted: false },
      select: {
        id: true,
        message: true,
        meeting: { select: { title: true } },
        acknowledgments: { select: { userId: true } },
      },
    });
    if (!cascade) {
      return NextResponse.json({ error: "Cascade message not found" }, { status: 404 });
    }

    const ackedIds = new Set(cascade.acknowledgments.map((a) => a.userId));
    const pending = await prisma.user.findMany({
      where: { active: true, id: { notIn: [...ackedIds] } },
      select: { id: true },
    });

    if (pending.length > 0) {
      try {
        await prisma.userNotification.createMany({
          data: pending.map((u) => ({
            userId: u.id,
            type: NOTIFICATION_TYPES.CASCADE_REMINDER,
            title: `Reminder: acknowledge the cascade from ${cascade.meeting?.title ?? "the leadership meeting"}`,
            body: cascade.message.slice(0, 140),
            link: "/communication?tab=cascade",
          })),
        });
      } catch (err) {
        logger.error("cascade remind: fan-out failed", { cascadeId: id, err });
        return NextResponse.json({ error: "Reminder failed" }, { status: 500 });
      }
    }

    return NextResponse.json({ reminded: pending.length });
  },
  {
    roles: ["owner", "head_office", "admin"],
    rateLimit: { max: 3, windowMs: 60 * 60 * 1000 },
  },
);
