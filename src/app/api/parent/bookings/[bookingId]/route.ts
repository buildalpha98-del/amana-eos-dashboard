import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { isTodayOrFutureInServiceTz } from "@/lib/timezone";
import { isTrustedBlobUrl } from "@/lib/trusted-urls";
import { getParentChildIds } from "../route";
import { parseJsonField } from "@/lib/schemas/json-fields";
import {
  casualBookingSettingsSchema,
  type CasualBookingSettings,
} from "@/lib/service-settings";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * PATCH does two opposite things, chosen by `action`.
 *
 * A plain object rather than a discriminated union: the discriminator
 * has to DEFAULT to "absent" so the app's existing calls — a bare
 * { isIllness, notes } body — keep working, and a union can't have an
 * optional discriminator.
 */
const patchSchema = z.object({
  action: z.enum(["absent", "attending"]).optional().default("absent"),
  isIllness: z.boolean().optional().default(false),
  medicalCertificateUrl: z
    .string()
    .url()
    .refine(isTrustedBlobUrl, {
      message:
        "medicalCertificateUrl must be a URL issued by our upload endpoint",
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid absence data", parsed.error.flatten().fieldErrors);
  }

  const booking = await getBookingForParent(bookingId, ctx.parent.enrolmentIds);

  // ── Changing their mind ────────────────────────────────────────────
  // A family who marks a child absent and then finds their plans
  // changed had no way back — they had to ring the centre to undo a
  // tap. Allowed up to 24 hours before the session, the same window
  // that governs cancelling a casual booking, because after that the
  // centre has already staffed and catered to the number.
  if (parsed.data.action === "attending") {
    if (booking.status !== "absent_notified") {
      throw ApiError.badRequest(
        booking.status === "confirmed" || booking.status === "requested"
          ? "This session is already marked as attending."
          : `Cannot change a ${booking.status} booking back to attending.`,
      );
    }

    const hoursUntil =
      (new Date(booking.date).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      throw ApiError.badRequest(
        "It's less than 24 hours before this session — please message head office and we'll sort it out.",
      );
    }

    // Booking back to confirmed AND the absence removed, together. A
    // lingering absence row would keep the child off the roll while the
    // booking said they were coming.
    const [restored] = await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: { status: "confirmed" },
        include: {
          child: { select: { id: true, firstName: true, surname: true } },
          service: { select: { id: true, name: true } },
        },
      }),
      prisma.absence.deleteMany({
        where: {
          childId: booking.childId,
          serviceId: booking.serviceId,
          date: booking.date,
          sessionType: booking.sessionType,
        },
      }),
    ]);

    return NextResponse.json({ booking: restored, absence: null });
  }

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

  // Cancelling a PERMANENT booking is off unless the centre turns it on:
  // a recurring pattern drives ratios, rosters and invoices, so it's the
  // office's to change. Parents mark the single day as not attending
  // instead, which leaves the pattern intact.
  if (booking.type !== "casual") {
    const service = await prisma.service.findUnique({
      where: { id: booking.serviceId },
      select: { casualBookingSettings: true },
    });
    const settings = parseJsonField<CasualBookingSettings | null>(
      service?.casualBookingSettings,
      casualBookingSettingsSchema.nullable(),
      null,
    );
    if (!settings?.policy?.allowRecurringCancellation) {
      throw ApiError.badRequest(
        "Regular weekly bookings are changed by head office. To skip just this day, mark it as not attending — or message head office to change the pattern.",
      );
    }
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
