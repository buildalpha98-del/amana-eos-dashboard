import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

// GET /api/services/[id]/roll-call/weekly?weekStart=YYYY-MM-DD
// Returns children + bookings + attendanceRecords for a Mon–Sun (7 day) window.
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  if (
    !weekStart ||
    !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(weekStart)
  ) {
    throw ApiError.badRequest("weekStart (YYYY-MM-DD) required");
  }

  // Access: admin any; non-admin must match session.user.serviceId to :id
  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    const userServiceId = session.user.serviceId ?? null;
    if (userServiceId !== id) throw ApiError.forbidden();
  }

  // UTC-safe week boundary: parse weekStart as UTC midnight, add 7 UTC days
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const [children, attendanceRecords, bookings] = await Promise.all([
    prisma.child.findMany({
      where: {
        serviceId: id,
        status: "active",
        OR: [
          {
            bookings: {
              some: {
                date: { gte: start, lt: end },
                status: { in: ["confirmed", "requested"] },
              },
            },
          },
          { attendanceRecords: { some: { date: { gte: start, lt: end } } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        surname: true,
        photo: true,
        dob: true,
        bookingPrefs: true,
      },
      orderBy: { surname: "asc" },
    }),
    prisma.attendanceRecord.findMany({
      where: { child: { serviceId: id }, date: { gte: start, lt: end } },
      select: {
        id: true,
        childId: true,
        date: true,
        sessionType: true,
        status: true,
        signInTime: true,
        signOutTime: true,
        signedInById: true,
        signedOutById: true,
        absenceReason: true,
        notes: true,
      },
    }),
    prisma.booking.findMany({
      where: {
        child: { serviceId: id },
        date: { gte: start, lt: end },
        status: { in: ["confirmed", "requested"] },
      },
      select: {
        id: true,
        childId: true,
        date: true,
        sessionType: true,
        fee: true,
      },
    }),
  ]);

  return NextResponse.json({ children, attendanceRecords, bookings, weekStart });
});
