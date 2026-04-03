/**
 * Generates Booking create inputs from a child's bookingPrefs.
 *
 * Converts permanent enrolment preferences (e.g. BSC Mon/Wed, ASC Mon-Fri)
 * into concrete date-based Booking rows for a rolling 4-week window.
 */

import type { SessionType, BookingType } from "@prisma/client";

// ── Types ────────────────────────────────────────────────

interface BookingPrefs {
  sessionTypes?: string[];
  days?: Record<string, string[]>; // e.g. { "bsc": ["monday", "wednesday"], "asc": ["monday"] }
  bookingType?: string; // "permanent" | "casual" | ""
  startDate?: string; // YYYY-MM-DD
}

export interface BookingCreateInput {
  childId: string;
  serviceId: string;
  date: Date;
  sessionType: SessionType;
  status: "confirmed";
  type: BookingType;
}

// ── Constants ────────────────────────────────────────────

const DAY_NAME_TO_INDEX: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
};

const VALID_SESSIONS = new Set<string>(["bsc", "asc", "vc"]);

/** Default booking horizon: 4 weeks ahead from the effective start. */
const DEFAULT_WEEKS_AHEAD = 4;

// ── Helpers ──────────────────────────────────────────────

/**
 * Returns all dates within [start, end) that fall on the given weekday.
 * Uses UTC dates to avoid timezone offset issues with Prisma @db.Date.
 */
function getWeekdayDatesInRange(start: Date, end: Date, dayIndex: number): Date[] {
  const dates: Date[] = [];
  // Start from the first occurrence of dayIndex on or after `start`
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const currentDay = cursor.getUTCDay(); // 0=Sun
  const diff = (dayIndex - currentDay + 7) % 7;
  cursor.setUTCDate(cursor.getUTCDate() + diff);

  while (cursor < end) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return dates;
}

// ── Main Generator ───────────────────────────────────────

/**
 * Generate Booking create inputs for a child based on their bookingPrefs.
 *
 * @param childId - The child's ID
 * @param serviceId - The service the child is enrolled at
 * @param prefs - The child's bookingPrefs JSON
 * @param options.fromDate - Override the start date (defaults to max(prefs.startDate, today))
 * @param options.weeksAhead - How many weeks ahead to generate (default 4)
 */
export function generateBookings(
  childId: string,
  serviceId: string,
  prefs: unknown,
  options?: { fromDate?: Date; weeksAhead?: number },
): BookingCreateInput[] {
  if (!prefs || typeof prefs !== "object") return [];

  const bp = prefs as BookingPrefs;

  // Only generate for permanent bookings
  if (bp.bookingType !== "permanent") return [];

  const days = bp.days;
  if (!days || typeof days !== "object") return [];

  const weeksAhead = options?.weeksAhead ?? DEFAULT_WEEKS_AHEAD;

  // Effective start: max(bookingPrefs.startDate, today, fromDate)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let effectiveStart = today;
  if (bp.startDate) {
    const prefStart = new Date(bp.startDate);
    prefStart.setUTCHours(0, 0, 0, 0);
    if (prefStart > effectiveStart) effectiveStart = prefStart;
  }
  if (options?.fromDate) {
    const from = new Date(options.fromDate);
    from.setUTCHours(0, 0, 0, 0);
    if (from > effectiveStart) effectiveStart = from;
  }

  // End date: weeksAhead weeks from effective start
  const endDate = new Date(effectiveStart);
  endDate.setUTCDate(endDate.getUTCDate() + weeksAhead * 7);

  const bookings: BookingCreateInput[] = [];

  // Iterate each session type and its enrolled days
  for (const [sessionKey, dayNames] of Object.entries(days)) {
    if (!VALID_SESSIONS.has(sessionKey)) continue;
    if (!Array.isArray(dayNames) || dayNames.length === 0) continue;

    const sessionType = sessionKey as SessionType;

    for (const dayName of dayNames) {
      const dayIndex = DAY_NAME_TO_INDEX[dayName.toLowerCase()];
      if (dayIndex === undefined) continue;

      const dates = getWeekdayDatesInRange(effectiveStart, endDate, dayIndex);
      for (const date of dates) {
        bookings.push({
          childId,
          serviceId,
          date,
          sessionType,
          status: "confirmed",
          type: "permanent",
        });
      }
    }
  }

  return bookings;
}
