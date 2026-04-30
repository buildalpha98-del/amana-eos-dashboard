import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { casualBookingSettingsSchema, type CasualBookingSettings } from "@/lib/service-settings";
import { checkCasualBookingAllowed } from "@/lib/casual-booking-check";
import { parseJsonField } from "@/lib/schemas/json-fields";

const bulkBookingSchema = z.object({
  childId: z.string().min(1),
  serviceId: z.string().min(1),
  bookings: z
    .array(
      z.object({
        date: z.string().min(1),
        sessionType: z.enum(["bsc", "asc", "vc"]),
      }),
    )
    .min(1, "At least one booking required")
    .max(10, "Maximum 10 bookings at once"),
});

/**
 * POST /api/parent/bookings/bulk
 *
 * Creates multiple booking requests in a single serializable transaction.
 * Each booking is checked against Service.casualBookingSettings; any failure
 * rolls back the whole batch with `{ error: "Booking N: <reason>" }`.
 * Duplicate bookings (same child/service/date/sessionType) are skipped silently
 * to match the prior `createMany + skipDuplicates` behaviour.
 */
export const POST = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = bulkBookingSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }

  const { childId, serviceId, bookings } = parsed.data;

  // Verify the child belongs to the parent.
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { enrolmentId: true },
  });
  if (!child || !child.enrolmentId || !parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, casualBookingSettings: true },
  });
  if (!service) {
    throw ApiError.notFound("Service not found");
  }

  const settings = parseJsonField<CasualBookingSettings | null>(
    service.casualBookingSettings,
    casualBookingSettingsSchema.nullable(),
    null,
  );
  const now = new Date();

  const created = await prisma.$transaction(
    async (tx) => {
      const results: Array<{ index: number; id: string }> = [];

      for (let i = 0; i < bookings.length; i++) {
        const b = bookings[i];
        const bookingDate = new Date(`${b.date}T00:00:00.000Z`);

        const existing = await tx.booking.findUnique({
          where: {
            childId_serviceId_date_sessionType: {
              childId,
              serviceId,
              date: bookingDate,
              sessionType: b.sessionType,
            },
          },
        });
        // Skip duplicates silently (preserves prior createMany+skipDuplicates behaviour).
        if (existing) continue;

        const currentCount = await tx.booking.count({
          where: {
            serviceId,
            date: bookingDate,
            sessionType: b.sessionType,
            type: "casual",
            status: { in: ["requested", "confirmed"] },
          },
        });

        const check = checkCasualBookingAllowed({
          settings,
          sessionType: b.sessionType,
          bookingDate,
          now,
          currentCasualBookings: currentCount,
        });
        if (!check.ok) {
          throw ApiError.badRequest(`Booking ${i + 1}: ${check.reason}`);
        }

        const row = await tx.booking.create({
          data: {
            childId,
            serviceId,
            date: bookingDate,
            sessionType: b.sessionType,
            status: "requested",
            type: "casual",
          },
          select: { id: true },
        });
        results.push({ index: i, id: row.id });
      }

      return results;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return NextResponse.json(
    {
      created: created.length,
      requested: bookings.length,
      skipped: bookings.length - created.length,
    },
    { status: 201 },
  );
});
