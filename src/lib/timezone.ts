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
    // hour12:false renders midnight as "24" in V8.
    hour: Number(parts.hour) % 24,
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

/**
 * Midnight UTC of today in the service timezone, suitable for comparing
 * Prisma `@db.Date` columns (which are stored as UTC midnight of the local day).
 */
function getTodayUtcFromServiceTz(
  date: Date = new Date(),
  tz: string = SERVICE_TZ,
): Date {
  const local = getLocalDateParts(date, tz);
  return new Date(Date.UTC(local.year, local.month - 1, local.day));
}

/**
 * True when `bookingDate` (a UTC-midnight Date or ISO string representing the
 * service-timezone local day) falls on or after today in the service timezone.
 */
export function isTodayOrFutureInServiceTz(
  bookingDate: Date | string,
  now: Date = new Date(),
  tz: string = SERVICE_TZ,
): boolean {
  const target = new Date(bookingDate);
  if (Number.isNaN(target.getTime())) return false;
  return target.getTime() >= getTodayUtcFromServiceTz(now, tz).getTime();
}

/**
 * Today's date at the centre, as "YYYY-MM-DD". `new Date().toISOString()`
 * gives the UTC date, which in Sydney is YESTERDAY until 10–11am — so a
 * morning roll opened on it showed the previous day's children.
 */
export function serviceTodayISO(now: Date = new Date(), tz: string = SERVICE_TZ): string {
  const { year, month, day } = getLocalDateParts(now, tz);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Any date as the centre's "YYYY-MM-DD" (2026-10-09). Use instead of
 * `d.toISOString().slice(0, 10)`, which is the UTC day: for a date built
 * at local midnight in the browser (`setHours(0,0,0,0)`, `new Date(y,m,d)`)
 * that is the PREVIOUS day in Sydney, and for "now" it's yesterday until
 * 10–11am. A UTC-midnight `@db.Date` value lands on the same day either way,
 * so this is safe for both kinds of date, in the browser and on the server.
 */
export function serviceDateISO(d: Date | string | number, tz: string = SERVICE_TZ): string {
  return serviceTodayISO(d instanceof Date ? d : new Date(d), tz);
}

/**
 * The centre's day around `now`, for server code (2026-10-09). Vercel runs
 * in UTC, so `d.setHours(0, 0, 0, 0)` there is UTC midnight — 10 or 11am
 * in Sydney — and until then "today" on the server was still yesterday.
 *
 *  - `dateOnly`: UTC midnight of the Sydney date, for `@db.Date` columns
 *    (booking dates, attendance dates, roster dates).
 *  - `start` / `end`: the real instants of Sydney midnight → next midnight,
 *    for timestamp columns (createdAt, clockInAt…).
 */
export function serviceDayBounds(now: Date = new Date(), tz: string = SERVICE_TZ) {
  const { year, month, day, hour, minute } = getLocalDateParts(now, tz);
  const dateOnly = new Date(Date.UTC(year, month - 1, day));
  // How far the centre's wall clock is ahead of UTC right now.
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMs = wall - Math.floor(now.getTime() / 60_000) * 60_000;
  const start = new Date(dateOnly.getTime() - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dateOnly, start, end };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `d` (a UTC-midnight date) moved by `n` whole days. */
export function addDaysUTC(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/**
 * The centre's calendar day as a UTC-midnight Date (the `@db.Date` value),
 * `addDays` from today. Server code that did `new Date(); setHours(0,0,0,0)`
 * got the UTC day — yesterday in Sydney until 10–11am, and every cron that
 * runs on Sydney's morning (18:00–23:00 UTC) a whole day behind.
 */
export function serviceDateOnly(now: Date = new Date(), addDays = 0): Date {
  return addDaysUTC(serviceDayBounds(now).dateOnly, addDays);
}

/**
 * Start of the centre's week as a UTC-midnight Date: Monday by default,
 * Sunday when `weekStartsOn` is 0 (for the few weekly keys that always
 * used Sunday).
 */
export function serviceWeekStart(now: Date = new Date(), weekStartsOn: 0 | 1 = 1): Date {
  const today = serviceDateOnly(now);
  const back = (today.getUTCDay() - weekStartsOn + 7) % 7;
  return addDaysUTC(today, -back);
}

/** First day of the centre's month (+`addMonths`) as a UTC-midnight Date. */
export function serviceMonthStart(now: Date = new Date(), addMonths = 0): Date {
  const today = serviceDateOnly(now);
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + addMonths, 1));
}

/** The real instant of Sydney midnight at the start of a centre date. */
export function serviceMidnight(dateOnly: Date, tz: string = SERVICE_TZ): Date {
  // Sydney's offset that day, read at UTC noon (clear of the 2–3am switch).
  const noon = new Date(dateOnly.getTime() + 12 * 60 * 60 * 1000);
  const { hour } = getLocalDateParts(noon, tz);
  return new Date(dateOnly.getTime() - (hour - 12) * 60 * 60 * 1000);
}
