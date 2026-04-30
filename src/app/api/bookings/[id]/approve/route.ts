import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmedNotification } from "@/lib/notifications/bookings";
import { logger } from "@/lib/logger";

/**
 * POST /api/bookings/[id]/approve
 *
 * Approve a booking request. Sets status to confirmed.
 */
export const POST = withApiAuth(
  async (req: NextRequest, session, context) => {
    const params = await context?.params;
    const bookingId = params?.id;
    if (!bookingId) throw ApiError.badRequest("Booking ID is required");

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true },
    });

    if (!booking) throw ApiError.notFound("Booking not found");
    if (booking.status !== "requested") {
      throw ApiError.conflict(`Cannot approve a booking with status "${booking.status}"`);
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "confirmed",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
      include: {
        child: { select: { id: true, firstName: true, surname: true } },
        service: { select: { id: true, name: true } },
      },
    });

    // Fire and forget
    sendBookingConfirmedNotification(bookingId).catch((err) => logger.error("Failed to send booking-confirmed notification", { err, bookingId }));

    return NextResponse.json(updated);
  },
  { minRole: "coordinator" },
);
