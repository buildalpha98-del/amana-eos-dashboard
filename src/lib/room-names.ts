/**
 * Naming a room from a row that already carries its `roomId`.
 *
 * Stage 2 of docs/rooms-migration-plan.md, the reporting and billing
 * half. Every report and statement that shows a room today reaches into
 * `Service.sessionTimes` with `roomLabel(times, key)` — the JSON, keyed
 * by the enum slot. That works, and it is exactly what has to stop:
 * a row for a room the enum never knew about has no key to look up, and
 * a report that can't name a room can't include it.
 *
 * These rows have carried a NOT NULL `roomId` since Stage 1. So the
 * name comes from the `Room` record instead, and a report shows however
 * many rooms a centre has.
 *
 * `room-resolver.ts` is the write-side counterpart — it turns a slot
 * into a `roomId`. This is the read side: a `roomId` into a name.
 */
import { prisma } from "@/lib/prisma";
import type { SessionType } from "@prisma/client";

export interface RoomName {
  id: string;
  name: string;
  legacyKey: SessionType | null;
  /** Retired rooms still appear in history — they just aren't offered. */
  archivedAt: Date | null;
}

/**
 * Same reasoning as the resolver's cache, and the same minute: rooms
 * change when an admin edits centre settings, never mid-report. A
 * minute of staleness costs a renamed room showing its old name on one
 * refresh, against a query on every report row otherwise.
 */
const TTL_MS = 60_000;

const cache = new Map<string, { rooms: RoomName[]; at: number }>();

/** Drop the cache. Exported for tests. */
export function _clearRoomNameCache(): void {
  cache.clear();
}

/**
 * Every room at a service, retired ones included.
 *
 * Retired rooms are IN, deliberately. This is the read path for history
 * — a statement from March or last year's attendance report — and a row
 * whose room has since been retired still has to say which room it was.
 * Callers offering a room to pick from should filter on `archivedAt`
 * themselves, which is the choice `/api/services/[id]/rooms?scope=`
 * makes explicit.
 */
export async function roomsForService(
  serviceId: string,
): Promise<RoomName[]> {
  const hit = cache.get(serviceId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rooms;

  const rooms = await prisma.room.findMany({
    where: { serviceId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, legacyKey: true, archivedAt: true },
  });

  cache.set(serviceId, { rooms, at: Date.now() });
  return rooms;
}

/**
 * Rooms for several services at once, as `serviceId → rooms`.
 *
 * One query for the services not already cached, rather than one per
 * service. A group report over twelve centres is the case this exists
 * for.
 */
export async function roomsForServices(
  serviceIds: string[],
): Promise<Map<string, RoomName[]>> {
  const out = new Map<string, RoomName[]>();
  const now = Date.now();
  const missing: string[] = [];

  for (const id of new Set(serviceIds)) {
    const hit = cache.get(id);
    if (hit && now - hit.at < TTL_MS) out.set(id, hit.rooms);
    else missing.push(id);
  }

  if (missing.length > 0) {
    const rows = await prisma.room.findMany({
      where: { serviceId: { in: missing } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        serviceId: true,
        name: true,
        legacyKey: true,
        archivedAt: true,
      },
    });

    // Seed every requested service, including ones with no rooms — an
    // empty list is a real answer and caching it stops a service in
    // that state re-querying on every report row.
    for (const id of missing) out.set(id, []);
    for (const r of rows) {
      out.get(r.serviceId)!.push({
        id: r.id,
        name: r.name,
        legacyKey: r.legacyKey,
        archivedAt: r.archivedAt,
      });
    }
    for (const id of missing) {
      cache.set(id, { rooms: out.get(id)!, at: now });
    }
  }

  return out;
}

/**
 * `roomId → name`, for labelling report rows.
 *
 * Takes the service so it can use the same per-service cache the rest
 * of this module fills — a report already knows which centre it's for,
 * and looking rooms up by id alone would mean a second query shape and
 * a second cache for the same rows.
 */
export async function roomNameMap(
  serviceId: string,
): Promise<Map<string, string>> {
  const rooms = await roomsForService(serviceId);
  return new Map(rooms.map((r) => [r.id, r.name]));
}

/**
 * The name for one room, or a fallback.
 *
 * The fallback is the point of the signature. A row from before the
 * Stage 1 backfill, or one whose room was hard-deleted, still has to
 * render — and "Unknown room" on a statement line is survivable in a
 * way that a blank cell or a crash is not.
 */
export function nameOf(
  rooms: Map<string, string> | RoomName[],
  roomId: string | null | undefined,
  fallback = "Unknown room",
): string {
  if (!roomId) return fallback;
  if (rooms instanceof Map) return rooms.get(roomId) ?? fallback;
  return rooms.find((r) => r.id === roomId)?.name ?? fallback;
}
