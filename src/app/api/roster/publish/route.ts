import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /api/roster/publish
// Flips all draft shifts in the week to published and notifies affected staff.
// ---------------------------------------------------------------------------

const publishSchema = z.object({
  serviceId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const { serviceId, weekStart } = parsed.data;

  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    if (role !== "member" || session.user.serviceId !== serviceId) {
      throw ApiError.forbidden();
    }
  }

  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Fetch the draft shifts we are about to publish so we know which users
    // to notify. updateMany doesn't return the rows themselves.
    const draftShifts = await tx.rosterShift.findMany({
      where: {
        serviceId,
        date: { gte: start, lt: end },
        status: "draft",
      },
      select: { userId: true },
    });

    const updated = await tx.rosterShift.updateMany({
      where: {
        serviceId,
        date: { gte: start, lt: end },
        status: "draft",
      },
      data: { status: "published", publishedAt: now },
    });

    const distinctUserIds = Array.from(
      new Set(
        draftShifts
          .map((s) => s.userId)
          .filter((u): u is string => typeof u === "string" && u.length > 0),
      ),
    );

    if (distinctUserIds.length > 0) {
      await tx.userNotification.createMany({
        data: distinctUserIds.map((userId) => ({
          userId,
          type: NOTIFICATION_TYPES.ROSTER_PUBLISHED,
          title: "Your roster for the week is published",
          body: `View your shifts for week of ${weekStart}`,
          link: `/roster/me?weekStart=${weekStart}`,
        })),
      });
    }

    return {
      publishedCount: updated.count,
      notificationsSent: distinctUserIds.length,
    };
  });

  return NextResponse.json(result);
});
