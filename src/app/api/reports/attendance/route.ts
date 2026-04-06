import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") || undefined;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "dateFrom and dateTo are required" }, { status: 400 });
  }

  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  to.setHours(23, 59, 59, 999);

  const bookingWhere = {
    date: { gte: from, lte: to },
    status: { in: ["confirmed" as const, "waitlisted" as const] },
    ...(serviceId ? { serviceId } : {}),
  };

  const attendanceWhere = {
    signInTime: { gte: from, lte: to },
    ...(serviceId ? { serviceId } : {}),
  };

  const [totalExpected, records, bookingsByDay] = await Promise.all([
    prisma.booking.count({ where: bookingWhere }),
    prisma.attendanceRecord.findMany({
      where: attendanceWhere,
      select: {
        signInTime: true,
        signOutTime: true,
        sessionType: true,
      },
    }),
    prisma.booking.groupBy({
      by: ["date"],
      where: bookingWhere,
      _count: true,
      orderBy: { date: "asc" },
    }),
  ]);

  const totalSignedIn = records.length;
  const totalSignedOut = records.filter((r) => r.signOutTime).length;
  const DEFAULT_CLOSE = 18.5; // 18:30
  const lateSignOuts = records.filter((r) => {
    if (!r.signOutTime) return false;
    const h = r.signOutTime.getHours() + r.signOutTime.getMinutes() / 60;
    return h > DEFAULT_CLOSE;
  }).length;
  const noShows = Math.max(0, totalExpected - totalSignedIn);

  // Build byDay
  const attendanceByDay = new Map<string, { signedIn: number; signedOut: number }>();
  for (const r of records) {
    if (!r.signInTime) continue;
    const key = r.signInTime.toISOString().slice(0, 10);
    const entry = attendanceByDay.get(key) || { signedIn: 0, signedOut: 0 };
    entry.signedIn++;
    if (r.signOutTime) entry.signedOut++;
    attendanceByDay.set(key, entry);
  }

  const byDay = bookingsByDay.map((b) => {
    const key = b.date.toISOString().slice(0, 10);
    const att = attendanceByDay.get(key) || { signedIn: 0, signedOut: 0 };
    return { date: key, expected: b._count, signedIn: att.signedIn, signedOut: att.signedOut };
  });

  // bySessionType
  const sessionTypes = ["bsc", "asc", "vc"];
  const bySessionType = await Promise.all(
    sessionTypes.map(async (st) => {
      const expected = await prisma.booking.count({
        where: { ...bookingWhere, sessionType: st as "bsc" | "asc" | "vc" },
      });
      const signedIn = records.filter((r) => r.sessionType === st).length;
      return { sessionType: st.toUpperCase(), expected, signedIn };
    }),
  );

  return NextResponse.json({
    totalExpected,
    totalSignedIn,
    totalSignedOut,
    lateSignOuts,
    noShows,
    byDay,
    bySessionType,
  });
}

export const GET = withApiAuth(handler, { minRole: "coordinator" });
