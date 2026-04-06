import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sendBookingDeclinedNotification } from "@/lib/notifications/bookings";

const declineSchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/bookings/[id]/decline
 *
 * Decline a booking request. Optionally provide a reason.
 */
export const POST = withApiAuth(
  async (req: NextRequest, session, context) => {
    const params = await context?.params;
    const bookingId = params?.id;
    if (!bookingId) throw ApiError.badRequest("Booking ID is required");

    const body = await parseJsonBody(req);
    const parsed = declineSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid request body", parsed.error.flatten().fieldErrors);
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true },
    });

    if (!booking) throw ApiError.notFound("Booking not found");
    if (booking.status !== "requested") {
      throw ApiError.conflict(`Cannot decline a booking with status "${booking.status}"`);
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "declined",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        declineReason: parsed.data.reason || null,
      },
      include: {
        child: { select: { id: true, firstName: true, surname: true } },
        service: { select: { id: true, name: true } },
      },
    });

    // Fire and forget
    sendBookingDeclinedNotification(bookingId, parsed.data.reason).catch(() => {});

    return NextResponse.json(updated);
  },
  { minRole: "coordinator" },
);
