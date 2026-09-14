/** Pure date helpers for the ramp — no Prisma, unit-testable. */
import { RAMP_CHECKIN_WEEKDAY, RAMP_LENGTH_DAYS, RAMP_WEEKS } from "./constants";

const DAY_MS = 86_400_000;

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Whole days elapsed since `start` (0 on the start date). */
export function rampDay(start: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - start.getTime()) / DAY_MS);
}

export function rampEndDate(start: Date): Date {
  return addDays(start, RAMP_LENGTH_DAYS);
}

/**
 * The 13 Friday check-in dates on or after the start date, at 05:00 UTC
 * (3pm AEST) so the cron that runs at that hour picks each up the same day.
 */
export function weeklyCheckInDates(start: Date, weeks: number = RAMP_WEEKS): Date[] {
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 5, 0, 0));
  const shift = (RAMP_CHECKIN_WEEKDAY - first.getUTCDay() + 7) % 7;
  const firstFriday = addDays(first, shift);
  return Array.from({ length: weeks }, (_, i) => addDays(firstFriday, i * 7));
}

/** Checkpoint due dates at 20:30 UTC (the daily ramp cron's hour). */
export function checkpointDueDate(start: Date, day: number): Date {
  const d = addDays(start, day);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 20, 30, 0));
}
