/**
 * Rooms as records, derived from the room JSON.
 *
 * Stage 0 of docs/rooms-migration-plan.md. Rooms today are seven fixed
 * slots in the `SessionType` enum, with their definitions living as JSON
 * on `Service.sessionTimes`. The `Room` table is a SHADOW of that JSON:
 * written here, read by nothing. The app carries on reading the JSON
 * exactly as it did.
 *
 * Doing it this way means the backfill can run, be compared against its
 * source, and be corrected, before a single read moves — and dropping
 * the table at any point before Stage 2 changes no behaviour.
 *
 * The mapping is split from the writing on purpose: `desiredRooms` is a
 * pure function of the JSON, so what a service's rooms SHOULD be can be
 * asserted without a database.
 */
import type { SessionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionKey, SessionTimes } from "@/lib/service-settings";
import { desiredRooms } from "@/lib/rooms-mapping";
import { logger } from "@/lib/logger";

export { desiredRooms, roomKeys, type DesiredRoom } from "@/lib/rooms-mapping";

/** What a sync did, for logging and for the reconciliation report. */
export interface SyncResult {
  serviceId: string;
  created: number;
  updated: number;
  /**
   * Rooms in the table with no matching key in the JSON.
   *
   * Reported, never deleted. A room can only reach this state by having
   * been configured and then removed from the JSON — and it may have
   * attendance recorded against it. Deleting it here would destroy the
   * only description of what those records referred to.
   */
  orphaned: number;
}

/**
 * Bring a service's rooms in line with its JSON.
 *
 * Idempotent: running it twice makes no second change. Called after any
 * write to `sessionTimes`, and by the backfill.
 */
export async function syncRoomsFromSessionTimes(
  serviceId: string,
  sessionTimes: SessionTimes | null | undefined,
): Promise<SyncResult> {
  const desired = desiredRooms(sessionTimes);

  const existing = await prisma.room.findMany({
    where: { serviceId },
    select: { id: true, legacyKey: true, archivedAt: true },
  });
  const byKey = new Map(
    existing.filter((r) => r.legacyKey).map((r) => [r.legacyKey as string, r]),
  );

  let created = 0;
  let updated = 0;

  for (const room of desired) {
    const current = byKey.get(room.legacyKey);
    const fields = {
      name: room.name,
      startTime: room.startTime,
      endTime: room.endTime,
      capacity: room.capacity,
      ratio: room.ratio,
      description: room.description,
      minAgeYears: room.minAgeYears,
      maxAgeYears: room.maxAgeYears,
      staffOnly: room.staffOnly,
      sortOrder: room.sortOrder,
    };

    if (!current) {
      await prisma.room.create({
        data: {
          serviceId,
          legacyKey: room.legacyKey as SessionType,
          ...fields,
          archivedAt: room.disabled ? new Date() : null,
        },
      });
      created += 1;
      continue;
    }

    /**
     * The retirement timestamp is only written on the transition.
     *
     * Re-stamping it on every sync would make "when did this room close"
     * read as today, forever — the question it exists to answer would be
     * answered wrongly by the act of asking it.
     */
    const archivedAt = room.disabled
      ? (current.archivedAt ?? new Date())
      : null;

    await prisma.room.update({
      where: { id: current.id },
      data: { ...fields, archivedAt },
    });
    updated += 1;
  }

  const wantedKeys = new Set(desired.map((r) => r.legacyKey));
  const orphaned = existing.filter(
    (r) => r.legacyKey && !wantedKeys.has(r.legacyKey as SessionKey),
  ).length;

  return { serviceId, created, updated, orphaned };
}

/**
 * Sync without letting a failure take the caller down.
 *
 * The shadow table is not the source of truth yet, so a sync that fails
 * must not fail the service update that triggered it — the JSON write
 * has already succeeded and IS the truth. A drifted shadow is repaired
 * by the next backfill; a rolled-back settings save is a person's work
 * thrown away.
 *
 * This changes at Stage 2, when reads move and the table stops being
 * optional.
 */
export async function syncRoomsQuietly(
  serviceId: string,
  sessionTimes: SessionTimes | null | undefined,
): Promise<void> {
  try {
    const result = await syncRoomsFromSessionTimes(serviceId, sessionTimes);
    if (result.orphaned > 0) {
      logger.warn("Rooms: shadow rows with no matching session key", {
        serviceId,
        orphaned: result.orphaned,
      });
    }
  } catch (err) {
    logger.error("Rooms: shadow sync failed", {
      serviceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** One service's reconciliation verdict. */
export interface ReconciliationRow {
  serviceId: string;
  serviceName: string;
  expected: number;
  actual: number;
  /** Keys the JSON describes that have no room. */
  missing: string[];
  /** Rooms with no matching key in the JSON. */
  orphaned: string[];
  /** Rooms whose stored fields no longer match the JSON. */
  drifted: string[];
}

/**
 * Compare every service's rooms against its JSON.
 *
 * The gate before Stage 1 begins: a shadow table nobody has checked is
 * worth nothing, and the failure mode this catches — a key configured
 * with no room behind it — is silent, because nothing reads the table
 * yet to notice.
 */
export async function reconcileRooms(): Promise<{
  rows: ReconciliationRow[];
  clean: boolean;
}> {
  const services = await prisma.service.findMany({
    select: {
      id: true,
      name: true,
      sessionTimes: true,
      rooms: {
        select: {
          legacyKey: true,
          name: true,
          startTime: true,
          endTime: true,
          capacity: true,
          ratio: true,
          staffOnly: true,
          archivedAt: true,
        },
      },
    },
  });

  const rows = services.map((s) => {
    const desired = desiredRooms(s.sessionTimes as SessionTimes | null);
    const actual = new Map(
      s.rooms.filter((r) => r.legacyKey).map((r) => [r.legacyKey as string, r]),
    );

    const missing = desired
      .filter((d) => !actual.has(d.legacyKey))
      .map((d) => d.legacyKey);

    const wanted = new Set(desired.map((d) => d.legacyKey));
    const orphaned = [...actual.keys()].filter(
      (k) => !wanted.has(k as SessionKey),
    );

    const drifted = desired
      .filter((d) => {
        const a = actual.get(d.legacyKey);
        if (!a) return false; // already counted as missing
        return (
          a.name !== d.name ||
          a.startTime !== d.startTime ||
          a.endTime !== d.endTime ||
          a.capacity !== d.capacity ||
          a.ratio !== d.ratio ||
          a.staffOnly !== d.staffOnly ||
          // Only the archived STATE is compared, never the timestamp —
          // the timestamp is ours and has no counterpart in the JSON.
          Boolean(a.archivedAt) !== d.disabled
        );
      })
      .map((d) => d.legacyKey);

    return {
      serviceId: s.id,
      serviceName: s.name,
      expected: desired.length,
      actual: actual.size,
      missing,
      orphaned,
      drifted,
    };
  });

  return {
    rows,
    clean: rows.every(
      (r) => r.missing.length === 0 && r.drifted.length === 0,
    ),
  };
}

/**
 * Populate the table for every service.
 *
 * Idempotent, so it is safe to run on every deploy and safe to re-run
 * after fixing a service's JSON by hand.
 *
 * Orphans are deliberately NOT cleaned up: see `SyncResult.orphaned`.
 */
export async function backfillRooms(): Promise<{
  services: number;
  created: number;
  updated: number;
  orphaned: number;
}> {
  const services = await prisma.service.findMany({
    select: { id: true, sessionTimes: true },
  });

  let created = 0;
  let updated = 0;
  let orphaned = 0;

  for (const s of services) {
    const r = await syncRoomsFromSessionTimes(
      s.id,
      s.sessionTimes as SessionTimes | null,
    );
    created += r.created;
    updated += r.updated;
    orphaned += r.orphaned;
  }

  return { services: services.length, created, updated, orphaned };
}
