import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { getCentreScope, applyCentreFilter } from "@/lib/centre-scope";
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

  // Centre scoping. The previous version trusted `serviceId` outright and
  // only fell back to the caller's own centre for `member` — so any
  // authenticated user could read another centre's booking requests by
  // passing its id, and a `staff` caller with no param read every centre's.
  // `getCentreScope` returns null for org-wide roles (owner / admin / EOS).
  const { serviceIds } = await getCentreScope(session);

  if (serviceId) {
    if (serviceIds !== null && !serviceIds.includes(serviceId)) {
      throw ApiError.forbidden("You do not have access to this service");
    }
    where.serviceId = serviceId;
  } else {
    applyCentreFilter(where, serviceIds);
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
