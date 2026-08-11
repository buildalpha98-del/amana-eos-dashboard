/**
 * GET /api/services/[id]/rooms
 *
 * A centre's rooms, read from the `Room` table.
 *
 * Stage 2 of docs/rooms-migration-plan.md — the first read to move.
 * Every surface that lists rooms today enumerates `SESSION_KEYS`, the
 * seven fixed enum slots, and filters them through the JSON. That is
 * precisely what makes an eighth room impossible: not the storage, which
 * has been ready since Stage 0, but the fact that nothing ASKS for the
 * rooms — they ask for the slots and look each one up.
 *
 * So this returns rows, not slots. A caller that renders what this
 * gives it will show an eighth room the day one exists, without
 * another change.
 *
 * Fees still come from the JSON. They move to a `RoomFee` table in
 * Stage 3, and pulling them across here would mean writing that table
 * before anything reads it — the same shadow-write problem Stage 0
 * already solved once. Until then a room's fees are looked up by its
 * `legacyKey`, and a room with no legacy key simply has none yet, which
 * is the honest answer for a room the enum never knew about.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import {
  roomFees,
  type SessionKey,
  type SessionTimes,
} from "@/lib/service-settings";

export const GET = withApiAuth(async (req, _session, context) => {
  const { id } = await context!.params!;
  const params = new URL(req.url).searchParams;

  /**
   * `active` (default) hides retired rooms — nothing forward-looking
   * should offer one. `all` includes them, for the screens that show
   * history. Same three states the room list itself offers.
   */
  const scope = params.get("scope") ?? "active";
  if (!["active", "retired", "all"].includes(scope)) {
    throw ApiError.badRequest(`Unknown scope "${scope}"`);
  }

  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true, sessionTimes: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  const rooms = await prisma.room.findMany({
    where: {
      serviceId: id,
      ...(scope === "active"
        ? { archivedAt: null }
        : scope === "retired"
          ? { archivedAt: { not: null } }
          : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const sessionTimes = service.sessionTimes as SessionTimes | null;

  return NextResponse.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      /**
       * Kept in the payload deliberately. Until Stage 4 drops the enum
       * columns, a caller writing a booking still needs the slot — this
       * is the one place it can get it without going back to the JSON.
       * Null for a room the enum never knew about.
       */
      legacyKey: r.legacyKey,
      startTime: r.startTime,
      endTime: r.endTime,
      capacity: r.capacity,
      ratio: r.ratio,
      description: r.description,
      minAgeYears: r.minAgeYears,
      maxAgeYears: r.maxAgeYears,
      photoUrl: r.photoUrl,
      staffOnly: r.staffOnly,
      archivedAt: r.archivedAt,
      /** Cheapest first, archived tiers excluded — same as `roomFees`. */
      fees: r.legacyKey
        ? roomFees(sessionTimes, r.legacyKey as SessionKey)
        : [],
    })),
  });
});
