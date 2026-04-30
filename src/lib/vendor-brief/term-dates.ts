/**
 * NSW state school term start dates.
 *
 * Used by the vendor-briefs term-readiness matrix to compute "term starts in
 * X weeks" countdowns. NSW is the dominant state for our centres; VIC dates
 * differ by 1-2 weeks but are close enough for v1 — flagged as follow-up.
 *
 * Source: NSW Department of Education public school term dates.
 * Update annually; if a year is missing the helpers return null and the UI
 * falls back to a generic "term selector" without countdown.
 */

const NSW_TERM_STARTS: Record<number, [string, string, string, string]> = {
  // [Term 1, Term 2, Term 3, Term 4] start dates — ISO yyyy-mm-dd
  2026: ["2026-01-28", "2026-04-28", "2026-07-21", "2026-10-13"],
  2027: ["2027-02-01", "2027-04-27", "2027-07-19", "2027-10-11"],
  2028: ["2028-01-31", "2028-04-26", "2028-07-17", "2028-10-09"],
};

export function termStartDate(year: number, term: number): Date | null {
  const row = NSW_TERM_STARTS[year];
  if (!row || term < 1 || term > 4) return null;
  return new Date(`${row[term - 1]}T00:00:00Z`);
}

export function weeksUntil(date: Date, now: Date = new Date()): number {
  const diffMs = date.getTime() - now.getTime();
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

/** The next term within the upcoming 26 weeks, or null if none. */
export function nextTermWithin(weeks: number, now: Date = new Date()): {
  year: number;
  term: number;
  startsOn: Date;
} | null {
  for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
    const y = now.getUTCFullYear() + yearOffset;
    for (let t = 1; t <= 4; t++) {
      const start = termStartDate(y, t);
      if (!start) continue;
      const diffWeeks = weeksUntil(start, now);
      if (diffWeeks >= 0 && diffWeeks <= weeks) {
        return { year: y, term: t, startsOn: start };
      }
    }
  }
  return null;
}
