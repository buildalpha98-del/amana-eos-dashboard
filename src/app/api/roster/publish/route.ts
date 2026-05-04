import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { notifyOpenShiftsPosted } from "@/lib/open-shift-notify";
import { logger } from "@/lib/logger";
import type { OpenShiftSummary } from "@/lib/email-templates";
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
      select: {
        userId: true,
        date: true,
        sessionType: true,
        shiftStart: true,
        shiftEnd: true,
        role: true,
      },
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

    // Pull out the unassigned (open) shifts that we just published —
    // these power the open-shift notification fan-out below. We grab
    // the metadata while we still have the rows in memory.
    const openShifts = draftShifts
      .filter((s) => !s.userId)
      .map((s) => ({
        date: s.date,
        sessionType: s.sessionType as OpenShiftSummary["sessionType"],
        shiftStart: s.shiftStart,
        shiftEnd: s.shiftEnd,
        role: s.role,
      }));

    return {
      publishedCount: updated.count,
      notificationsSent: distinctUserIds.length,
      openShifts,
    };
  });

  // Open-shift fan-out runs OUTSIDE the transaction. The publish has
  // already committed; if the email infrastructure is degraded the
  // worst case is a missed notification (the in-app bell might still
  // succeed, see notifyOpenShiftsPosted internals).
  let openShiftRecipients = 0;
  if (result.openShifts.length > 0) {
    try {
      const service = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { name: true },
      });
      if (service) {
        const baseUrl =
          process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";
        const fan = await notifyOpenShiftsPosted(prisma, {
          serviceId,
          serviceName: service.name,
          openShifts: result.openShifts.map((s, i) => ({
            id: `pending-${i}`, // not persisted; just for logging
            date: s.date,
            sessionType: s.sessionType,
            shiftStart: s.shiftStart,
            shiftEnd: s.shiftEnd,
            role: s.role,
          })),
          publishedById: session.user.id,
          openShiftsUrl: `${baseUrl}/my-portal`,
        });
        openShiftRecipients = fan.recipientCount;
      }
    } catch (err) {
      // Don't fail the publish call if the fan-out blows up.
      logger.error("publish: open-shift notify fan-out failed", {
        err: err instanceof Error ? err : new Error(String(err)),
        serviceId,
      });
    }
  }

  return NextResponse.json({
    publishedCount: result.publishedCount,
    notificationsSent: result.notificationsSent,
    openShiftsPosted: result.openShifts.length,
    openShiftRecipients,
  });
});
