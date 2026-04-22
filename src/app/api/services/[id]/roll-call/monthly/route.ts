import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

// GET /api/services/[id]/roll-call/monthly?month=YYYY-MM
// Returns per-day booked/attended/absent counts for the month.
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw ApiError.badRequest("month (YYYY-MM) required");
  }

  // Access: admin any; non-admin must match session.user.serviceId to :id
  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    const userServiceId = session.user.serviceId ?? null;
    if (userServiceId !== id) throw ApiError.forbidden();
  }

  // UTC-safe month boundary
  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  // Per-day status counts across attendance records
  const attGroups = await prisma.attendanceRecord.groupBy({
    by: ["date", "status"],
    where: { child: { serviceId: id }, date: { gte: monthStart, lt: monthEnd } },
    _count: { _all: true },
  });

  // Per-day booking counts (for days with bookings but no attendance records yet)
  const bookingGroups = await prisma.booking.groupBy({
    by: ["date"],
    where: {
      child: { serviceId: id },
      date: { gte: monthStart, lt: monthEnd },
      status: { in: ["confirmed", "requested"] },
    },
    _count: { _all: true },
  });

  // Build { dateKey → { booked, attended, absent } } map
  const perDay = new Map<
    string,
    { booked: number; attended: number; absent: number }
  >();
  for (const g of attGroups) {
    const key = g.date.toISOString().split("T")[0];
    const entry = perDay.get(key) ?? { booked: 0, attended: 0, absent: 0 };
    if (g.status === "present") entry.attended += g._count._all;
    else if (g.status === "absent") entry.absent += g._count._all;
    else entry.booked += g._count._all;
    perDay.set(key, entry);
  }
  for (const g of bookingGroups) {
    const key = g.date.toISOString().split("T")[0];
    const entry = perDay.get(key) ?? { booked: 0, attended: 0, absent: 0 };
    // Only fall back to booking count if there's no attendance activity yet
    if (entry.attended === 0 && entry.absent === 0 && entry.booked === 0) {
      entry.booked = g._count._all;
    }
    perDay.set(key, entry);
  }

  // Emit a row for every day in the month (zeroed if no data)
  const days: Array<{ date: string; booked: number; attended: number; absent: number }> =
    [];
  const cursor = new Date(monthStart);
  while (cursor < monthEnd) {
    const key = cursor.toISOString().split("T")[0];
    days.push({
      date: key,
      ...(perDay.get(key) ?? { booked: 0, attended: 0, absent: 0 }),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return NextResponse.json({ month, days });
});
