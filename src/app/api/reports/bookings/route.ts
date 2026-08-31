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

  const where = {
    date: { gte: from, lte: to },
    ...(serviceId ? { serviceId } : {}),
  };

  const [totalBookings, byStatusRaw, bySessionRaw, byTypeRaw, confirmedBookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.groupBy({ by: ["status"], where, _count: true }),
    /**
     * Grouped by ROOM. Stage 2 of docs/rooms-migration-plan.md — this
     * grouped by `sessionType` and then re-projected the result through
     * a literal ["bsc","asc","vc"], throwing away extra rooms the query
     * had already counted.
     */
    prisma.booking.groupBy({ by: ["roomId"], where, _count: true }),
    prisma.booking.groupBy({ by: ["type"], where, _count: true }),
    prisma.booking.findMany({
      where: { ...where, status: "confirmed", reviewedAt: { not: null } },
      select: { createdAt: true, reviewedAt: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    ["requested", "confirmed", "declined", "cancelled"].map((s) => [
      s,
      byStatusRaw.find((r) => r.status === s)?._count ?? 0,
    ]),
  );

  /**
   * One entry per room the centre has, named by the room and in its own
   * order — not three fixed keys shouted in upper case.
   *
   * Scoped to a single service when one was asked for. Across all
   * services a room name is not unique (every centre has an "Amana
   * Afternoons"), so the group report keeps counting by slot rather
   * than silently merging two centres' rooms into one bar.
   */
  /**
   * One entry per room, named by the room — not three fixed keys
   * shouted in upper case.
   *
   * Rooms with the same name are summed. Across a single centre that
   * can't happen; across the group it is exactly what's wanted — "how
   * many Amana Afternoons bookings did we take" is a group question,
   * and twelve separate identically-named bars would answer nothing.
   */
  const roomNames = await roomNamesForIds(
    bySessionRaw.map((r) => r.roomId),
  );
  const bySessionType: Record<string, number> = {};
  for (const row of bySessionRaw) {
    const name = roomNames.get(row.roomId) ?? "Unknown room";
    bySessionType[name] = (bySessionType[name] ?? 0) + row._count;
  }

  const casualVsPermanent = {
    casual: byTypeRaw.find((r) => r.type === "casual")?._count ?? 0,
    permanent: byTypeRaw.find((r) => r.type === "permanent")?._count ?? 0,
  };

  // Average approval time in hours
  let averageApprovalTimeHours = 0;
  if (confirmedBookings.length > 0) {
    const totalMs = confirmedBookings.reduce((sum, b) => {
      if (!b.reviewedAt) return sum;
      return sum + (b.reviewedAt.getTime() - b.createdAt.getTime());
    }, 0);
    averageApprovalTimeHours = Math.round((totalMs / confirmedBookings.length / 3600000) * 10) / 10;
  }

  return NextResponse.json({
    totalBookings,
    byStatus,
    bySessionType,
    casualVsPermanent,
    averageApprovalTimeHours,
  });
}

export const GET = withApiAuth(handler, { minRole: "member" });
