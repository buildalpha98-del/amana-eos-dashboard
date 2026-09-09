/**
 * The parent booking grid, translated into what the dashboard reads.
 *
 * The enrolment form asks families to tick a grid of PROGRAMS —
 * `SESSION_ROWS` in src/lib/enrol-draft.ts, keyed `riseAndShine` /
 * `amanaAfternoons` / `holidayQuest`. Everything downstream of the
 * enrolment reads something else entirely: `generateBookings()`
 * (approval, assign-service, and the booking-generator and
 * booking-extend crons), the enrolment PDF, and the service's children
 * tab all want SESSION TYPES with lowercase weekday names:
 *
 *   { sessionTypes: ["asc"], days: { asc: ["monday", "tuesday"] } }
 *
 * The portal's submit route used to write neither, so a family's answer
 * never reached the roll (PR #254). This module is the single place the
 * two vocabularies meet — the submit route calls it on the way in, and
 * the backfill calls it to repair enrolments submitted before the fix.
 * A second copy of this mapping is how the two would drift apart again.
 */

import { WEEKDAYS } from "@/lib/enrol-draft";

/** Grid row key → the `SessionType` every reader downstream uses. */
export const SESSION_TYPE_FOR_ROW: Record<string, string> = {
  riseAndShine: "bsc",
  amanaAfternoons: "asc",
  holidayQuest: "vc",
};

const WEEKDAY_LOOKUP = new Map<string, string>(
  WEEKDAYS.map((d) => [d.toLowerCase(), d.toLowerCase()]),
);

export interface BookingGrid {
  sessionTypes: string[];
  days: Record<string, string[]>;
}

/**
 * Translate a grid selection into `{ sessionTypes, days }`.
 *
 * Takes `unknown` because every caller reads it out of a `Json` column
 * where the declared type is a hope rather than a guarantee.
 */
export function bookingGridFromSessions(sessions: unknown): BookingGrid {
  const sessionTypes: string[] = [];
  const days: Record<string, string[]> = {};

  if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) {
    return { sessionTypes, days };
  }

  for (const [rowKey, picked] of Object.entries(
    sessions as Record<string, unknown>,
  )) {
    const sessionType = SESSION_TYPE_FOR_ROW[rowKey];
    if (!sessionType || !Array.isArray(picked) || picked.length === 0) continue;
    sessionTypes.push(sessionType);
    // A whole-of-session tick stores ["yes"] rather than weekdays (casual
    // bookings, and Holiday Quest always). That's a real selection but not
    // a weekly pattern — keeping it here would have generateBookings look
    // up a weekday called "yes". The session still shows on the pack.
    days[sessionType] = picked
      .map((d) => WEEKDAY_LOOKUP.get(String(d).toLowerCase()))
      .filter((d): d is string => Boolean(d));
  }

  return { sessionTypes, days };
}

/**
 * Does this `bookingPrefs` blob carry a grid answer the readers can't see?
 *
 * True only when the parent picked something AND the canonical fields are
 * missing or empty — so a re-run is a no-op, and a record a human has
 * since corrected by hand is left alone.
 */
export function needsBookingGridBackfill(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return false;
  const bp = prefs as Record<string, unknown>;

  const { sessionTypes } = bookingGridFromSessions(bp.sessions);
  if (sessionTypes.length === 0) return false;

  const existing = Array.isArray(bp.sessionTypes) ? bp.sessionTypes : [];
  if (existing.length > 0) return false;

  return true;
}

/**
 * The repaired blob, or null when there is nothing to repair.
 *
 * Everything the parent typed is preserved — `sessions` included — so a
 * later reader can still see the answer in its original vocabulary.
 */
export function backfillBookingGrid(
  prefs: unknown,
): Record<string, unknown> | null {
  if (!needsBookingGridBackfill(prefs)) return null;
  const bp = prefs as Record<string, unknown>;
  const grid = bookingGridFromSessions(bp.sessions);
  return { ...bp, sessionTypes: grid.sessionTypes, days: grid.days };
}
