import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { isTodayOrFutureInServiceTz } from "@/lib/timezone";
import { isTrustedBlobUrl } from "@/lib/trusted-urls";
import { getParentChildIds } from "../route";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const markAbsentSchema = z.object({
  isIllness: z.boolean().optional().default(false),
  medicalCertificateUrl: z
    .string()
    .url()
    .refine(isTrustedBlobUrl, {
      message: "medicalCertificateUrl must be a URL issued by our upload endpoint",
    })
    .optional(),
  notes: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getBookingForParent(bookingId: string, enrolmentIds: string[]) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });
  if (!booking) throw ApiError.notFound("Booking not found");

  const childIds = await getParentChildIds(enrolmentIds);
  if (!childIds.has(booking.childId)) {
    throw ApiError.forbidden("You do not have access to this booking");
  }

  return booking;
}

// ---------------------------------------------------------------------------
// PATCH — Mark a booking as absent (creates Absence record)
// ---------------------------------------------------------------------------

export const PATCH = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const bookingId = params?.bookingId;
  if (!bookingId) throw ApiError.badRequest("bookingId is required");

  const body = await parseJsonBody(req);
  const parsed = markAbsentSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid absence data", parsed.error.flatten().fieldErrors);
  }

  const booking = await getBookingForParent(bookingId, ctx.parent.enrolmentIds);

  // Can only mark confirmed or requested bookings as absent
  if (booking.status !== "confirmed" && booking.status !== "requested") {
    throw ApiError.badRequest(
      `Cannot mark a ${booking.status} booking as absent`,
    );
  }

  // Cannot mark a booking in the past — absence must be reported for today or later
  if (!isTodayOrFutureInServiceTz(booking.date)) {
    throw ApiError.badRequest(
      "Cannot report an absence for a past booking. Contact your centre if the record is incorrect.",
    );
  }

  const { isIllness, medicalCertificateUrl, notes } = parsed.data;

  // Atomic: update booking status + create absence record
  const [updatedBooking, absence] = await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "absent_notified" },
      include: {
        child: { select: { id: true, firstName: true, surname: true } },
        service: { select: { id: true, name: true } },
      },
    }),
    prisma.absence.create({
      data: {
        childId: booking.childId,
        serviceId: booking.serviceId,
        date: booking.date,
        sessionType: booking.sessionType,
        isIllness,
        medicalCertificateUrl,
        notes,
      },
    }),
  ]);

  return NextResponse.json({ booking: updatedBooking, absence });
});

// ---------------------------------------------------------------------------
// DELETE — Cancel a booking (only casual bookings, 24h+ in advance)
// ---------------------------------------------------------------------------

export const DELETE = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const bookingId = params?.bookingId;
  if (!bookingId) throw ApiError.badRequest("bookingId is required");

  const booking = await getBookingForParent(bookingId, ctx.parent.enrolmentIds);

  // Only casual bookings can be cancelled by parent
  if (booking.type !== "casual") {
    throw ApiError.badRequest(
      "Only casual bookings can be cancelled. Contact your centre for permanent booking changes.",
    );
  }

  // Must be at least 24 hours in the future
  const bookingDate = new Date(booking.date);
  const now = new Date();
  const hoursUntil = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntil < 24) {
    throw ApiError.badRequest(
      "Bookings can only be cancelled at least 24 hours in advance.",
    );
  }

  // Can only cancel requested or confirmed bookings
  if (booking.status !== "requested" && booking.status !== "confirmed") {
    throw ApiError.badRequest(`Cannot cancel a ${booking.status} booking`);
  }

  const cancelled = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "cancelled" },
    include: {
      child: { select: { id: true, firstName: true, surname: true } },
      service: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(cancelled);
});
