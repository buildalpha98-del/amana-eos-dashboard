/**
 * Tiny business-days helper for Sprint 4 vendor SLA calculations.
 *
 * v1: skips Sat/Sun. No public holiday awareness yet — flagged as a
 * follow-up. Add a NSW + VIC holiday source when needed.
 */

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sun = 0, Sat = 6
}

/** Add N business days to a date. Negative N is allowed (subtract). */
export function addBusinessDays(start: Date, days: number): Date {
  if (days === 0) return new Date(start.getTime());
  const dir = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  const out = new Date(start.getTime());
  while (remaining > 0) {
    out.setUTCDate(out.getUTCDate() + dir);
    if (!isWeekend(out)) remaining -= 1;
  }
  return out;
}

/** Count business days between two dates (start inclusive, end exclusive). */
export function businessDaysBetween(from: Date, to: Date): number {
  if (from.getTime() === to.getTime()) return 0;
  const dir = to.getTime() > from.getTime() ? 1 : -1;
  let count = 0;
  const cursor = new Date(from.getTime());
  while (
    (dir === 1 && cursor.getTime() < to.getTime()) ||
    (dir === -1 && cursor.getTime() > to.getTime())
  ) {
    cursor.setUTCDate(cursor.getUTCDate() + dir);
    if (!isWeekend(cursor)) count += dir;
  }
  return count;
}
