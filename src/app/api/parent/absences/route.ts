import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { resolveAppSettings } from "@/lib/app-settings";
import { getParentChildIds } from "@/app/api/parent/bookings/route";
import { sendAbsenceConfirmationNotification } from "@/lib/notifications/bookings";
import { logger } from "@/lib/logger";
import { resolveRoomId } from "@/lib/room-resolver";

const absenceSchema = z.object({
  childId: z.string().min(1, "childId is required"),
  serviceId: z.string().min(1, "serviceId is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  reason: z.enum(["sick", "holiday", "other"]).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/parent/absences
 *
 * Record an absence notification from a parent.
 */
export const POST = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = absenceSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid absence data", parsed.error.flatten().fieldErrors);
  }

  const { childId, serviceId, date, sessionType, reason, notes } = parsed.data;

  // Verify child belongs to this parent
  const childIds = await getParentChildIds(parent.enrolmentIds);
  if (!childIds.has(childId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  // The centre can switch app absences off entirely — some want them
  // phoned through so someone hears WHY, which matters when the reason
  // is a child-protection flag rather than a cold.
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { appSettings: true },
  });
  if (!resolveAppSettings(svc?.appSettings).parents.canMarkAbsence) {
    throw ApiError.badRequest(
      "This centre asks families to phone absences through rather than marking them in the app.",
    );
  }

  // Validate date is today or in the future (AEST)
  const absenceDate = new Date(date + "T00:00:00.000Z");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (absenceDate < today) {
    throw ApiError.badRequest("Cannot record an absence for a past date");
  }

  // Upsert absence record
  const absence = await prisma.absence.upsert({
    where: {
      childId_serviceId_date_sessionType: {
        childId,
        serviceId,
        date: absenceDate,
        sessionType,
      },
    },
    create: {
      childId,
      serviceId,
      date: absenceDate,
      // Stage 1 dual key — see room-resolver.ts.
      roomId: await resolveRoomId(serviceId, sessionType),
      sessionType,
      reason: reason || null,
      isIllness: reason === "sick",
      notifiedById: null, // parent portal — no User ID
      notes: notes || null,
    },
    update: {
      reason: reason || null,
      isIllness: reason === "sick",
      notes: notes || null,
      notifiedAt: new Date(),
    },
    include: {
      child: { select: { id: true, firstName: true, surname: true } },
      service: { select: { id: true, name: true } },
    },
  });

  // Fire and forget
  sendAbsenceConfirmationNotification(absence.id).catch((err) => logger.error("Failed to send absence confirmation notification", { err, absenceId: absence.id }));

  return NextResponse.json(absence, { status: 201 });
});
