import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/bookings/requests
 *
 * Fetch booking requests (default: status=requested).
 * Query params: serviceId, status, page, limit
 */
export const GET = withApiAuth(async (req: NextRequest, session) => {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  const status = url.searchParams.get("status") || "requested";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.BookingWhereInput = {
    status: status as Prisma.EnumBookingStatusFilter,
  };

  // If serviceId provided, filter to that service; otherwise scope by user's service if coordinator
  if (serviceId) {
    where.serviceId = serviceId;
  } else if (session.user.role === "coordinator" && session.user.serviceId) {
    where.serviceId = session.user.serviceId;
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        child: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            photo: true,
            dob: true,
            yearLevel: true,
          },
        },
        service: { select: { id: true, name: true, code: true } },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return NextResponse.json({
    bookings,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});
