/**
 * Who is in this room.
 *
 * "In the room" means holding a permanent booking for it — the children
 * a coordinator would list if you asked who's in Amana Afternoons. A
 * casual who came once in March isn't in the room, so casual bookings
 * are counted separately rather than folded in.
 *
 * Days come from the bookings themselves, so the answer is "Mon, Wed,
 * Fri" rather than a number nobody can act on.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const GET = withApiAuth(async (_req, session, context) => {
  const { id, roomId } = (await context!.params!) as {
    id: string;
    roomId: string;
  };
  assertServiceAccess(session as never, id);

  /**
   * Stage 2: addressed by ROOM, not by enum slot. The room has to
   * belong to this service — an id from elsewhere would otherwise list
   * another centre's children through this centre's URL.
   */
  const room = await prisma.room.findFirst({
    where: { id: roomId, serviceId: id },
    select: { id: true },
  });
  if (!room) throw ApiError.notFound("Room not found at this service");

  // Only bookings from here on: a pattern set last year still describes
  // the room today, but one from two years ago is noise.
  const since = new Date();
  since.setMonth(since.getMonth() - 1);
  since.setHours(0, 0, 0, 0);

  const bookings = await prisma.booking.findMany({
    where: {
      serviceId: id,
      roomId,
      status: { in: ["confirmed", "requested"] },
      date: { gte: since },
    },
    select: {
      childId: true,
      date: true,
      type: true,
      child: {
        select: { id: true, firstName: true, surname: true, yearLevel: true },
      },
    },
    take: 5000,
  });

  const byChild = new Map<
    string,
    {
      id: string;
      name: string;
      yearLevel: string | null;
      days: Set<number>;
      casualOnly: boolean;
    }
  >();

  for (const b of bookings) {
    if (!b.child) continue;
    const existing = byChild.get(b.childId);
    const entry =
      existing ??
      {
        id: b.child.id,
        name: `${b.child.firstName} ${b.child.surname}`.trim(),
        yearLevel: b.child.yearLevel,
        days: new Set<number>(),
        casualOnly: true,
      };
    if (b.type === "permanent") {
      entry.casualOnly = false;
      entry.days.add(b.date.getUTCDay());
    }
    byChild.set(b.childId, entry);
  }

  const all = [...byChild.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return NextResponse.json({
    children: all
      .filter((c) => !c.casualOnly)
      .map((c) => ({
        id: c.id,
        name: c.name,
        yearLevel: c.yearLevel,
        days: [...c.days].sort().map((d) => DAY_SHORT[d]),
      })),
    // Counted, not listed: they're not "in the room", but a coordinator
    // still wants to know the room sees casual traffic.
    casualCount: all.filter((c) => c.casualOnly).length,
  });
});
