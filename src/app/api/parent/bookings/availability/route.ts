import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * GET /api/parent/bookings/availability?serviceId=xxx&month=2026-04
 *
 * Returns per-date, per-session availability for the given month.
 * Each entry shows: date, sessionType, confirmedCount, capacity, available.
 */
export const GET = withParentAuth(async (req, { parent }) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const month = searchParams.get("month"); // "2026-04"

  if (!serviceId || !month) {
    throw ApiError.badRequest("serviceId and month are required");
  }

  // Verify the parent has access to this service
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const parentServiceIds = new Set(enrolments.map((e) => e.serviceId).filter(Boolean));
  if (!parentServiceIds.has(serviceId)) {
    throw ApiError.forbidden("You do not have access to this service");
  }

  // Get service capacity
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { capacity: true },
  });
  const capacity = service?.capacity ?? 30; // fallback default

  // Compute month date range
  const [year, mon] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, mon - 1, 1));
  const lastDay = new Date(Date.UTC(year, mon, 0)); // last day of month

  // Count confirmed bookings per date+session
  const bookings = await prisma.booking.groupBy({
    by: ["date", "sessionType"],
    where: {
      serviceId,
      date: { gte: firstDay, lte: lastDay },
      status: { in: ["confirmed", "requested"] },
    },
    _count: { id: true },
  });

  // Build availability map
  const availability: Array<{
    date: string;
    sessionType: string;
    booked: number;
    capacity: number;
    available: number;
  }> = bookings.map((b) => ({
    date: new Date(b.date).toISOString().split("T")[0],
    sessionType: b.sessionType,
    booked: b._count.id,
    capacity,
    available: Math.max(0, capacity - b._count.id),
  }));

  return NextResponse.json(availability);
});
