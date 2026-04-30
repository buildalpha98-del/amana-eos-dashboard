import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { safeLimit } from "@/lib/pagination";
import { notifyBookingConfirmed, notifyBookingCancelled } from "@/lib/parent-notifications";
import { logger } from "@/lib/logger";

/** Org-wide roles that can access any service. */
const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

/**
 * Zod schema to safely extract only the parent fields the UI needs.
 * The primaryParent is a raw JSON column — never trust its shape.
 */
const parentContactSchema = z.object({
  firstName: z.string().default(""),
  surname: z.string().default(""),
  email: z.string().default(""),
  mobile: z.string().default(""),
}); // extra keys in the JSON blob are ignored by explicit field picking below

// GET /api/services/[id]/booking-requests
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  // Service-membership check
  if (
    !ORG_WIDE_ROLES.has(session.user.role) &&
    session.user.serviceId !== id
  ) {
    throw ApiError.forbidden("You do not have access to this service");
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = safeLimit(url.searchParams.get("limit"), 20, 50);

  const bookings = await prisma.booking.findMany({
    where: { serviceId: id, status: "requested" },
    orderBy: { date: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      child: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          enrolment: {
            select: { primaryParent: true },
          },
        },
      },
    },
  });

  const hasMore = bookings.length > limit;
  const items = hasMore ? bookings.slice(0, limit) : bookings;
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

  // Sanitize: parse the JSON blob through Zod — only expose safe fields
  const sanitized = items.map((b) => {
    const rawParent = b.child.enrolment?.primaryParent;
    const parsed = rawParent ? parentContactSchema.safeParse(rawParent) : null;

    return {
      ...b,
      child: {
        ...b.child,
        enrolment: {
          primaryParent: parsed?.success
            ? {
                firstName: parsed.data.firstName,
                surname: parsed.data.surname,
                email: parsed.data.email,
                mobile: parsed.data.mobile,
              }
            : null,
        },
      },
    };
  });

  return NextResponse.json({ items: sanitized, nextCursor });
});

// PATCH /api/services/[id]/booking-requests — approve or reject a booking
const patchSchema = z.object({
  bookingId: z.string().min(1, "bookingId is required"),
  status: z.enum(["confirmed", "cancelled"], {
    error: "Status must be 'confirmed' or 'cancelled'",
  }),
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    // Service-membership check
    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== id
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const body = await parseJsonBody(req);

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { bookingId, status } = parsed.data;

    // Atomic check-and-update to prevent TOCTOU race condition
    const updated = await prisma.booking.updateMany({
      where: {
        id: bookingId,
        serviceId: id,
        status: "requested",
      },
      data: { status },
    });

    if (updated.count === 0) {
      const existing = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { serviceId: true, status: true },
      });

      if (!existing || existing.serviceId !== id) {
        throw ApiError.notFound("Booking not found");
      }
      throw ApiError.conflict(`Booking is already ${existing.status}`);
    }

    // Activity log
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: status === "confirmed" ? "approved_booking" : "rejected_booking",
        entityType: "Booking",
        entityId: bookingId,
        details: { serviceId: id, newStatus: status },
      },
    });

    // Return the updated booking for the UI
    const result = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        child: {
          select: { id: true, firstName: true, surname: true },
        },
      },
    });

    // Fire-and-forget: notify parent of booking status change
    const notifyFn = status === "confirmed" ? notifyBookingConfirmed : notifyBookingCancelled;
    notifyFn(bookingId).catch((err) =>
      logger.error("Booking notification failed", { bookingId, err }),
    );

    return NextResponse.json(result);
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
