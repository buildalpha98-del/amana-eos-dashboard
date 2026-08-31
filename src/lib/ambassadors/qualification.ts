import {
  QUALIFYING_PAID_SESSIONS,
  TIER_HIGH,
  TIER_LOW,
  WINDOW_DAYS,
} from "./constants";

/**
 * Pure qualification maths for the Ambassadors pilot. No Prisma here —
 * recompute.ts loads the data and calls these; tests exercise them directly.
 *
 * All dates are `@db.Date` columns, which Prisma returns as UTC midnight —
 * so day arithmetic is done in UTC to avoid timezone drift.
 */

export interface SessionLike {
  date: Date;
  fee: number;
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * First attendance = the earliest session of ANY fee — the free first
 * session counts as attendance (it anchors the window) even though it
 * never counts toward the 4 qualifying paid sessions.
 */
export function deriveFirstAttendance(sessions: SessionLike[]): Date | null {
  if (sessions.length === 0) return null;
  let min = sessions[0].date;
  for (const s of sessions) {
    if (utcDay(s.date) < utcDay(min)) min = s.date;
  }
  return new Date(utcDay(min));
}

/**
 * Last day of the qualification window, inclusive. A 28-day window starting
 * on day 0 ends on day 27 — a session exactly 28 days after first
 * attendance is OUTSIDE the window.
 */
export function windowEnd(firstAttendance: Date): Date {
  return new Date(utcDay(firstAttendance) + (WINDOW_DAYS - 1) * MS_PER_DAY);
}

/**
 * Paid (fee > 0) sessions inside [firstAttendance, windowEnd] inclusive.
 * $0 sessions (the free first session) never count.
 */
export function paidSessionsInWindow(
  sessions: SessionLike[],
  firstAttendance: Date,
): number {
  const start = utcDay(firstAttendance);
  const end = utcDay(windowEnd(firstAttendance));
  let count = 0;
  for (const s of sessions) {
    const day = utcDay(s.date);
    if (s.fee > 0 && day >= start && day <= end) count++;
  }
  return count;
}

export function meetsPaidSessionThreshold(
  sessions: SessionLike[],
  firstAttendance: Date | null,
): boolean {
  if (!firstAttendance) return false;
  return paidSessionsInWindow(sessions, firstAttendance) >= QUALIFYING_PAID_SESSIONS;
}

/**
 * Tier by regular sessions per week: ≥3 → $50, 1–2 → $30, 0/unset → null
 * (tier not assessable — the Director must set sessions per week before
 * a credited record can be verified).
 */
export function tierAmountFor(
  sessionsPerWeek: number | null | undefined,
): number | null {
  if (sessionsPerWeek == null || sessionsPerWeek <= 0) return null;
  return sessionsPerWeek >= 3 ? TIER_HIGH : TIER_LOW;
}
