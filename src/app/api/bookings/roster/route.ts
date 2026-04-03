import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

/**
 * GET /api/bookings/roster?serviceId=xxx&weekStart=2026-04-06
 *
 * Returns confirmed/requested bookings for Mon-Fri of the given week,
 * grouped by date string and session type for the weekly roster UI.
 */
export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const weekStartStr = searchParams.get("weekStart");

  if (!serviceId || !weekStartStr) {
    throw ApiError.badRequest("serviceId and weekStart are required");
  }

  // Compute Mon-Fri date range
  const monday = new Date(weekStartStr);
  monday.setUTCHours(0, 0, 0, 0);
  const friday = new Date(monday);
  friday.setUTCDate(friday.getUTCDate() + 4);

  const bookings = await prisma.booking.findMany({
    where: {
      serviceId,
      date: { gte: monday, lte: friday },
      status: { in: ["confirmed", "requested"] },
    },
    select: {
      date: true,
      sessionType: true,
      type: true,
      status: true,
      childId: true,
      child: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          medical: true,
          dietary: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { child: { surname: "asc" } }],
  });

  // Group by date → sessionType → children
  const roster: Record<string, Record<string, Array<{
    childId: string;
    firstName: string;
    surname: string;
    bookingType: string;
    hasMedical: boolean;
    hasDietary: boolean;
  }>>> = {};

  for (const b of bookings) {
    const dateKey = new Date(b.date).toISOString().split("T")[0];
    if (!roster[dateKey]) roster[dateKey] = {};
    if (!roster[dateKey][b.sessionType]) roster[dateKey][b.sessionType] = [];

    const med = b.child.medical as Record<string, unknown> | null;
    const diet = b.child.dietary as Record<string, unknown> | null;

    roster[dateKey][b.sessionType].push({
      childId: b.child.id,
      firstName: b.child.firstName,
      surname: b.child.surname,
      bookingType: b.type,
      hasMedical: !!(med && (med.anaphylaxisRisk || med.allergies || (Array.isArray(med.conditions) && med.conditions.length > 0))),
      hasDietary: !!(diet && (diet.details || diet.restrictions || diet.dietaryRequirements)),
    });
  }

  return NextResponse.json(roster);
});
