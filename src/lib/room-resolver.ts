/**
 * `(serviceId, sessionType)` → `roomId`.
 *
 * Stage 1 of docs/rooms-migration-plan.md. Every model that carries a
 * room now carries BOTH keys, and every write sets both. Reads still use
 * `sessionType` — that moves in Stage 2 — so nothing here changes what
 * the app shows. What it buys is a `roomId` that is already correct and
 * already constrained by the time reads need it.
 *
 * Both sets of uniques hold at once, deliberately. A resolver bug that
 * returned the wrong room would collide on the parallel unique and fail
 * the write immediately, rather than diverging quietly and surfacing
 * weeks later in a billing run.
 *
 * The mapping is a pure function of the pair — `Room` holds exactly one
 * row per slot per service — so nothing here needs to be clever about
 * invalidation, and a missed write is repairable by re-running the
 * backfill rather than by reconstructing intent.
 */
import type { SessionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Rooms change when an admin edits centre settings — rarely, and never
 * in the middle of a request that depends on the change. A minute of
 * staleness costs nothing and takes a query off every booking write.
 *
 * Deliberately short rather than permanent: a room created by the Stage
 * 0 sync during a settings save must become resolvable without a
 * redeploy, or the first writes after adding a room would all miss.
 */
const TTL_MS = 60_000;

const cache = new Map<string, { roomId: string | null; at: number }>();

const keyOf = (serviceId: string, sessionType: string) =>
  `${serviceId}:${sessionType}`;

/** Drop the cache. Exported for tests and for the backfill endpoint. */
export function _clearRoomCache(): void {
  cache.clear();
}

/**
 * The room for a session slot at a service, or null if there isn't one.
 *
 * Null is a real answer, not an error. A service whose Stage 0 sync
 * hasn't run yet, or a slot that was never configured, genuinely has no
 * room — and the write must still succeed, because `sessionType` is
 * still the key the app reads. The null is recorded, reported by the
 * reconciliation, and filled by the next backfill.
 *
 * Misses are cached too. Without that, a service with an unresolvable
 * slot would hit the database on every single write to it, which is
 * precisely the service already in trouble.
 */
export async function resolveRoomId(
  serviceId: string | null | undefined,
  sessionType: SessionType | string | null | undefined,
): Promise<string | null> {
  if (!serviceId || !sessionType) return null;

  const k = keyOf(serviceId, sessionType);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.roomId;

  try {
    const room = await prisma.room.findUnique({
      where: {
        serviceId_legacyKey: {
          serviceId,
          legacyKey: sessionType as SessionType,
        },
      },
      select: { id: true },
    });
    const roomId = room?.id ?? null;
    cache.set(k, { roomId, at: Date.now() });

    if (!roomId) {
      logger.warn("Rooms: no room for session slot", { serviceId, sessionType });
    }
    return roomId;
  } catch (err) {
    /**
     * A resolver failure must not fail the write it decorates.
     *
     * `sessionType` is still the key every read uses, so a write with a
     * null `roomId` is a complete, correct record by the standards of
     * this stage — it is only the shadow key that is missing, and the
     * backfill fills it. Throwing here would turn a degraded shadow into
     * a family unable to book.
     *
     * This inverts at Stage 2, when reads move to `roomId` and a null
     * stops being survivable.
     */
    logger.error("Rooms: resolver failed", {
      serviceId,
      sessionType,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Both keys, ready to spread into a Prisma `data`.
 *
 * The shape write sites use:
 *
 *   data: { childId, date, ...(await roomKeys(serviceId, "asc")) }
 *
 * Spreading a single helper rather than assigning `roomId` separately is
 * what keeps the two keys from drifting apart at a call site: there is
 * no way to write one without the other.
 */
export async function roomKeys<T extends SessionType | string>(
  serviceId: string | null | undefined,
  sessionType: T,
): Promise<{ sessionType: T; roomId: string | null }> {
  return { sessionType, roomId: await resolveRoomId(serviceId, sessionType) };
}

/**
 * Resolve many slots at one service in a single query.
 *
 * For the writes that loop — a week of bookings, a roster template
 * applied across sessions — where calling the single resolver per row
 * would be a query per row on a cold cache.
 */
export async function resolveRoomIds(
  serviceId: string | null | undefined,
  sessionTypes: Array<SessionType | string>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const wanted = [...new Set(sessionTypes)];
  if (!serviceId || wanted.length === 0) {
    for (const s of wanted) out.set(s, null);
    return out;
  }

  const now = Date.now();
  const misses: string[] = [];
  for (const s of wanted) {
    const hit = cache.get(keyOf(serviceId, s));
    if (hit && now - hit.at < TTL_MS) out.set(s, hit.roomId);
    else misses.push(s);
  }
  if (misses.length === 0) return out;

  try {
    const rooms = await prisma.room.findMany({
      where: { serviceId, legacyKey: { in: misses as SessionType[] } },
      select: { id: true, legacyKey: true },
    });
    const found = new Map(rooms.map((r) => [String(r.legacyKey), r.id]));
    for (const s of misses) {
      const roomId = found.get(s) ?? null;
      out.set(s, roomId);
      cache.set(keyOf(serviceId, s), { roomId, at: now });
    }
  } catch (err) {
    logger.error("Rooms: batch resolver failed", {
      serviceId,
      error: err instanceof Error ? err.message : String(err),
    });
    for (const s of misses) out.set(s, null);
  }

  return out;
}

/**
 * Stamp `roomId` onto rows a pure generator produced.
 *
 * `generateBookings` is deliberately pure and synchronous — it is the
 * one place bookings are built, and its edge cases (fortnight patterns,
 * term boundaries) are tested without a database. Making it async to
 * look rooms up would drag Prisma into that. So the rows come back
 * without a room and get one here, in the one hop before the write.
 *
 * All three booking-creating paths — the generator cron, the extend
 * cron, and a manual save on a child — go through the same helper, so
 * this covers every one of them.
 */
export async function stampRoomIds<
  T extends { serviceId: string; sessionType: SessionType },
>(rows: T[]): Promise<Array<T & { roomId: string | null }>> {
  if (rows.length === 0) return [];

  const byService = new Map<string, Map<string, string | null>>();
  for (const serviceId of new Set(rows.map((r) => r.serviceId))) {
    byService.set(
      serviceId,
      await resolveRoomIds(
        serviceId,
        rows.filter((r) => r.serviceId === serviceId).map((r) => r.sessionType),
      ),
    );
  }

  return rows.map((r) => ({
    ...r,
    roomId: byService.get(r.serviceId)?.get(r.sessionType) ?? null,
  }));
}
