/**
 * Bulletproof timezone utilities for OSHC services in Australia/Sydney.
 *
 * Uses the Intl API (V8-native, no external dependencies) to get the correct
 * local date components. Unlike the `toLocaleString → new Date()` round-trip
 * hack, this extracts numeric parts directly and never re-parses a formatted
 * string — eliminating DST edge-case bugs.
 */

/** Default timezone for all OSHC services. */
export const SERVICE_TZ = "Australia/Sydney";

interface LocalDate {
  year: number;
  month: number; // 1-indexed (Jan=1)
  day: number;
  dayOfWeek: number; // 0=Sun, 1=Mon ... 6=Sat
  hour: number;
  minute: number;
}

/**
 * Get the date components in the service timezone using Intl.DateTimeFormat.
 * This is the only correct way to decompose a Date into timezone-local parts
 * without a library — it uses the ICU timezone database baked into V8.
 */
export function getLocalDateParts(date: Date = new Date(), tz: string = SERVICE_TZ): LocalDate {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    dayOfWeek: weekdayMap[parts.weekday] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * Get the Monday of the current week in the service timezone,
 * returned as a UTC midnight Date suitable for Prisma `@db.Date` queries.
 *
 * The calculation is:
 * 1. Get today's date in the service timezone
 * 2. Calculate the offset back to Monday (Mon=0, Tue=1, ..., Sun=6)
 * 3. Construct a UTC Date at midnight for that Monday
 */
export function getMondayUtc(date: Date = new Date(), tz: string = SERVICE_TZ): Date {
  const local = getLocalDateParts(date, tz);

  // dayOfWeek: 0=Sun, 1=Mon ... offset from Monday
  const offsetFromMonday = local.dayOfWeek === 0 ? 6 : local.dayOfWeek - 1;

  // Build a Date for today in local timezone, then subtract days to get Monday
  const mondayDay = local.day - offsetFromMonday;

  // Use UTC to avoid any system-timezone interference
  return new Date(Date.UTC(local.year, local.month - 1, mondayDay));
}
