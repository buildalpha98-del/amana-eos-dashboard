/**
 * Reads a centre's room setup and says what's wrong with it — before a
 * regulator, an assessor, or a full session does.
 *
 * Two questions a room configuration has to survive:
 *
 *  1. Do the rooms, added up, promise more places than the service is
 *     approved for? Over-booking against approved places is a licensing
 *     problem, and it is invisible when you only ever look at one room
 *     at a time.
 *
 *  2. Does each room's capacity divide cleanly by its ratio? A room of
 *     50 at 1:12 needs five educators but only uses 48 of their 60
 *     places — you are paying for a fifth educator and selling none of
 *     their capacity. Either trim to 48 or fill to 60.
 *
 * Pure functions, no database: the same maths runs in the settings UI
 * while someone is typing, and in tests.
 */

import {
  activeSessionKeys,
  roomLabel,
  type SessionKey,
  type SessionTimes,
} from "@/lib/service-settings";

export interface RoomAdvisory {
  /** Which room, or null when the finding is about the whole service. */
  key: SessionKey | null;
  roomName: string | null;
  /**
   * `error` — breaks a rule (over approved places).
   * `warning` — legal but wasteful, or missing information.
   */
  level: "error" | "warning";
  message: string;
}

export interface RoomConfigurationInput {
  sessionTimes: SessionTimes | null | undefined;
  /** Places the service is approved for. Null when not yet recorded. */
  approvedPlaces: number | null | undefined;
  /** Per-room capacity by key. Missing = not set. */
  capacities: Partial<Record<SessionKey, number | null>>;
  /** Per-room minimum ratio, "1:15" style. Falls back to `defaultRatio`. */
  ratios: Partial<Record<SessionKey, string | null>>;
  /** The service (or federal) default when a room has none of its own. */
  defaultRatio: string;
}

/** "1:15" → {staff: 1, children: 15}; anything malformed → null. */
export function parseRatio(
  value: string | null | undefined,
): { staff: number; children: number } | null {
  if (!value || !/^\d+:\d+$/.test(value)) return null;
  const [staff, children] = value.split(":").map(Number);
  if (!staff || !children || staff <= 0 || children <= 0) return null;
  return { staff, children };
}

/** Educators needed to hold `capacity` children at `ratio`. */
export function educatorsRequired(capacity: number, ratio: string): number {
  const parsed = parseRatio(ratio);
  if (!parsed || capacity <= 0) return 0;
  const perEducator = parsed.children / parsed.staff;
  return Math.ceil(capacity / perEducator);
}

/**
 * The two capacities either side of the current one that sit exactly on
 * an educator boundary: the largest that needs one FEWER educator, and
 * the one that fills the educators already required.
 */
export function capacityBoundaries(
  capacity: number,
  ratio: string,
): { trimTo: number; fillTo: number; required: number } | null {
  const parsed = parseRatio(ratio);
  if (!parsed || capacity <= 0) return null;
  const perEducator = parsed.children / parsed.staff;
  const required = Math.ceil(capacity / perEducator);
  const fillTo = Math.floor(required * perEducator);
  const trimTo = Math.floor(Math.max(required - 1, 1) * perEducator);
  return { trimTo, fillTo, required };
}

export function analyseRoomConfiguration(
  input: RoomConfigurationInput,
): RoomAdvisory[] {
  const { sessionTimes, approvedPlaces, capacities, ratios, defaultRatio } =
    input;
  const out: RoomAdvisory[] = [];
  // Staff-only rooms hold no children, so capacity and ratio advice
  // about them is noise — and "no capacity set" on the staff room is a
  // warning nobody can action.
  const keys = activeSessionKeys(sessionTimes).filter(
    (k) => !sessionTimes?.[k]?.staffOnly,
  );

  // ── Whole-service: do the rooms promise more than we're approved for?
  // Rooms that run at different times of day (before school and after
  // school) are never full at once, so summing every room would cry wolf
  // constantly. The meaningful total is the largest single room — the
  // most children who can be on site at one moment.
  const sized = keys
    .map((k) => ({ key: k, capacity: capacities[k] ?? null }))
    .filter((r): r is { key: SessionKey; capacity: number } =>
      typeof r.capacity === "number" && r.capacity > 0,
    );

  if (approvedPlaces && approvedPlaces > 0) {
    for (const room of sized) {
      if (room.capacity > approvedPlaces) {
        out.push({
          key: room.key,
          roomName: roomLabel(sessionTimes, room.key),
          level: "error",
          message: `Capacity ${room.capacity} is more than the ${approvedPlaces} places this service is approved for.`,
        });
      }
    }
  } else if (sized.length > 0) {
    out.push({
      key: null,
      roomName: null,
      level: "warning",
      message:
        "Approved places aren't recorded, so room capacities can't be checked against your service approval.",
    });
  }

  // ── Per room: capacity set? and does it use its educators?
  for (const key of keys) {
    const name = roomLabel(sessionTimes, key);
    const capacity = capacities[key] ?? null;

    if (capacity === null || capacity === 0) {
      out.push({
        key,
        roomName: name,
        level: "warning",
        message: `No capacity set, so ${name} can't be checked for ratio or over-booking.`,
      });
      continue;
    }

    const ratio = ratios[key] || defaultRatio;
    const bounds = capacityBoundaries(capacity, ratio);
    if (!bounds) continue;

    const { trimTo, fillTo, required } = bounds;
    if (capacity !== fillTo && capacity !== trimTo) {
      out.push({
        key,
        roomName: name,
        level: "warning",
        message: `${capacity} places at ${ratio} needs ${required} educator${
          required === 1 ? "" : "s"
        }. Trim to ${trimTo} to need ${required - 1}, or lift to ${fillTo} to use all ${required}.`,
      });
    }
  }

  return out;
}
