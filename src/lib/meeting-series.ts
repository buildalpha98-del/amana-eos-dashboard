/**
 * Meeting-series occurrence maths (execution layer, 2026-08-31).
 *
 * A series stores a WALL-CLOCK time in an IANA timezone (default
 * Australia/Sydney) so DST never shifts the meeting: "Tuesday 13:30
 * Sydney" is 03:30Z under AEST and 02:30Z under AEDT. No date library in
 * the repo — this uses the standard Intl inverse-offset trick (the same
 * algorithm as date-fns-tz's zonedTimeToUtc): guess the UTC instant,
 * measure the zone offset at the guess, correct, and re-measure once for
 * DST edges. A weekly business-hours time can never land inside the
 * skipped/ambiguous 2–3am transition hour, so two iterations converge.
 */

export interface SeriesTiming {
  dayOfWeek: number; // 0=Sunday … 6=Saturday, in the series timezone
  minuteOfDay: number; // minutes from local midnight (13:30 → 810)
  timezone: string; // IANA zone
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0=Sunday … 6=Saturday
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formatterCache.set(timezone, fmt);
  }
  return fmt;
}

/** The wall-clock parts of a UTC instant, as seen in `timezone`. */
export function wallClockIn(instant: Date, timezone: string): WallClock {
  const parts = formatterFor(timezone).formatToParts(instant);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    dayOfWeek: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** Treat wall-clock parts as if they were UTC (for offset measurement). */
function asUtcMs(w: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second ?? 0);
}

/**
 * The UTC instant at which `timezone` shows the given local wall-clock
 * time. Inverse-offset trick, iterated twice for DST edges.
 */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timezone: string,
): Date {
  const target = asUtcMs(local);
  let guess = new Date(target);
  for (let i = 0; i < 2; i++) {
    const seen = wallClockIn(guess, timezone);
    const offset = asUtcMs(seen) - guess.getTime();
    guess = new Date(target - offset);
  }
  return guess;
}

/**
 * The next wall-clock (dayOfWeek, minuteOfDay) in `s.timezone` STRICTLY
 * after `from`, as a UTC Date.
 */
export function nextOccurrence(s: SeriesTiming, from: Date): Date {
  const local = wallClockIn(from, s.timezone);
  // Walk forward day by day (in local calendar space) until the weekday
  // matches AND the resulting instant is after `from`. At most 8 steps.
  for (let addDays = 0; addDays <= 7; addDays++) {
    // Local "today + addDays" via UTC calendar arithmetic on the parts —
    // day-length anomalies don't matter here because we re-anchor the
    // final instant through zonedTimeToUtc.
    const base = new Date(Date.UTC(local.year, local.month - 1, local.day + addDays));
    const candidateDow = (local.dayOfWeek + addDays) % 7;
    if (candidateDow !== s.dayOfWeek) continue;
    const occ = zonedTimeToUtc(
      {
        year: base.getUTCFullYear(),
        month: base.getUTCMonth() + 1,
        day: base.getUTCDate(),
        hour: Math.floor(s.minuteOfDay / 60),
        minute: s.minuteOfDay % 60,
      },
      s.timezone,
    );
    if (occ.getTime() > from.getTime()) return occ;
  }
  // Unreachable (a weekday always recurs within 7 days), but keep TS happy.
  throw new Error("nextOccurrence: no occurrence found within 8 days");
}

/**
 * The UTC range [start, end) covering the LOCAL calendar day (in
 * `timezone`) that contains `occ`. Used for same-local-day idempotency
 * when the cron checks whether an occurrence already exists.
 */
export function sameLocalDayRange(
  occ: Date,
  timezone: string,
): { start: Date; end: Date } {
  const local = wallClockIn(occ, timezone);
  const start = zonedTimeToUtc(
    { year: local.year, month: local.month, day: local.day, hour: 0, minute: 0 },
    timezone,
  );
  const nextDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  const end = zonedTimeToUtc(
    {
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
      hour: 0,
      minute: 0,
    },
    timezone,
  );
  return { start, end };
}
