import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { roomNamesForIds } from "@/lib/room-names";

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
        roomId: true,
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

  /**
   * Per-ROOM expected-vs-signed-in.
   *
   * Stage 2 of docs/rooms-migration-plan.md. This ran a literal
   * ["bsc","asc","vc"] and shipped `st.toUpperCase()` as the label, so
   * a centre's fourth room was absent from the report entirely, and the
   * three that did show were named by their filing code rather than by
   * whatever the centre calls them.
   *
   * One grouped query rather than a count per room — the old shape
   * issued a query per session, and would have issued one per room.
   */
  const expectedByRoom = await prisma.booking.groupBy({
    by: ["roomId"],
    where: bookingWhere,
    _count: true,
  });

  const signedInByRoom = new Map<string, number>();
  for (const r of records) {
    if (!r.roomId) continue;
    signedInByRoom.set(r.roomId, (signedInByRoom.get(r.roomId) ?? 0) + 1);
  }

  const roomNames = await roomNamesForIds([
    ...expectedByRoom.map((g) => g.roomId),
    ...signedInByRoom.keys(),
  ]);

  /*
   * Rooms sharing a name are summed. Within one centre that can't
   * happen; across the group it's exactly the question being asked —
   * twelve identically-named bars would answer nothing.
   */
  const perRoom = new Map<string, { expected: number; signedIn: number }>();
  const bump = (
    roomId: string | null,
    field: "expected" | "signedIn",
    n: number,
  ) => {
    const name = (roomId && roomNames.get(roomId)) || "Unknown room";
    const row = perRoom.get(name) ?? { expected: 0, signedIn: 0 };
    row[field] += n;
    perRoom.set(name, row);
  };
  for (const g of expectedByRoom) bump(g.roomId, "expected", g._count);
  for (const [roomId, n] of signedInByRoom) bump(roomId, "signedIn", n);

  /** The field keeps its name on the wire — the chart's axis reads it. */
  const bySessionType = [...perRoom.entries()].map(([name, counts]) => ({
    sessionType: name,
    ...counts,
  }));

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

export const GET = withApiAuth(handler, { minRole: "member" });
