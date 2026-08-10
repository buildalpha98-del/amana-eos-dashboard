/**
 * The pure half of the rooms mapping: what a service's rooms SHOULD be,
 * given its JSON.
 *
 * Split from `rooms.ts` so it carries no database import. The deploy
 * seed runs outside Next's module resolution and needs this mapping
 * without the prisma singleton coming with it — and keeping the
 * derivation pure is also what lets it be asserted without a database.
 *
 * See docs/rooms-migration-plan.md.
 */
import {
  CORE_SESSION_KEYS,
  EXTRA_SESSION_KEYS,
  DEFAULT_ROOMS,
  roomLabel,
  type SessionKey,
  type SessionTimes,
} from "./service-settings";

/** What one room should look like, derived from the JSON. */
export interface DesiredRoom {
  legacyKey: SessionKey;
  name: string;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  ratio: string | null;
  description: string | null;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  staffOnly: boolean;
  /** Whether the JSON says this room is retired. */
  disabled: boolean;
  sortOrder: number;
}

/**
 * Which enum slots are rooms at this service.
 *
 * The three core programmes always are — every centre runs before
 * school, after school and vacation care, and their absence from the
 * JSON means "not customised", not "doesn't exist".
 *
 * An extra slot counts when it appears in the JSON AT ALL, which is
 * deliberately broader than `activeSessionKeys`. That helper filters
 * extras on having a label, because an unnamed slot shouldn't appear on
 * a booking form. Here the question is different: has this slot ever
 * been configured, and might there be attendance recorded against it?
 * A centre that named "Extra 2", took bookings, then cleared the label
 * still needs a room for those bookings to belong to. Losing it would
 * strand real records.
 *
 * Disabled rooms are included for the same reason, and carry their
 * retirement across as `archivedAt`.
 */
export function roomKeys(
  sessionTimes: SessionTimes | null | undefined,
): SessionKey[] {
  const extras = EXTRA_SESSION_KEYS.filter(
    (k) => sessionTimes?.[k] !== undefined,
  );
  return [...CORE_SESSION_KEYS, ...extras];
}

/**
 * The rooms a service's JSON describes.
 *
 * Pure. Given the same JSON it returns the same rooms, which is what
 * makes the sync idempotent and the reconciliation check meaningful.
 */
export function desiredRooms(
  sessionTimes: SessionTimes | null | undefined,
): DesiredRoom[] {
  return roomKeys(sessionTimes).map((key, index) => {
    const room = sessionTimes?.[key];
    const fallback = DEFAULT_ROOMS[key];

    return {
      legacyKey: key,
      // `roomLabel` falls back to the Amana default, then to the slot
      // code — so an unnamed extra reads as "extra3" rather than being
      // blank. A room with no name at all is worse than an ugly one.
      name: roomLabel(sessionTimes, key),
      /**
       * The default hours apply only to the three core programmes. An
       * extra slot has no meaningful default — `DEFAULT_ROOMS` gives it
       * empty strings — and writing "" as a time would look like a
       * configured value rather than an absent one.
       */
      startTime: room?.start || fallback.start || null,
      endTime: room?.end || fallback.end || null,
      capacity: room?.capacity ?? null,
      ratio: room?.ratio ?? null,
      description: room?.description ?? null,
      minAgeYears: room?.minAgeYears ?? null,
      maxAgeYears: room?.maxAgeYears ?? null,
      staffOnly: room?.staffOnly ?? false,
      disabled: room?.disabled ?? false,
      sortOrder: index,
    };
  });
}
