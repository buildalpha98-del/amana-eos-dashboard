/**
 * Working out which calendar days a block-out request actually covers.
 *
 * Pulled out of the route because this is the part with the edge cases —
 * weekend skipping, an all-weekend range, a duplicated date in a list —
 * and those are worth testing directly rather than through a mocked
 * Prisma client.
 *
 * Everything here is UTC-midnight `Date` objects. These are calendar
 * dates, not instants: "the centre is closed on the 3rd" is true for the
 * whole of the 3rd regardless of timezone, and building them at UTC
 * midnight is what stops a local-time offset shifting one across a day
 * boundary.
 */

/** A closure longer than a term is a mistake, not a closure. */
export const MAX_RANGE_DAYS = 90;

const DAY_MS = 86_400_000;

export const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/**
 * Saturday or Sunday. Read in UTC, which is safe precisely because every
 * date here was built by `dateOnly`.
 */
export const isWeekend = (d: Date) =>
  d.getUTCDay() === 0 || d.getUTCDay() === 6;

export interface BlockOutRequest {
  date?: string;
  endDate?: string;
  dates?: string[];
  excludeWeekends?: boolean;
}

export type ExpandResult =
  | { ok: true; dates: Date[] }
  | { ok: false; error: string };

/**
 * Expand a request into the days it covers.
 *
 * An explicit `dates` list wins over a range, and is taken as given —
 * weekends included. Someone typing a Saturday means it, and silently
 * dropping it would be a lie about what was saved. Weekend skipping only
 * applies to a RANGE, where it defaults on: a three-week holiday range
 * otherwise writes nine rows for days the centre was never open.
 */
export function expandBlockOutDates(req: BlockOutRequest): ExpandResult {
  if (req.dates?.length) {
    const seen = new Set<string>();
    const out: Date[] = [];
    for (const ymd of req.dates) {
      if (seen.has(ymd)) continue;
      seen.add(ymd);
      out.push(dateOnly(ymd));
    }
    // Chronological regardless of the order they were typed, so the
    // "created N days" count and the resulting list agree with what the
    // person expected to see.
    out.sort((a, b) => a.getTime() - b.getTime());
    return { ok: true, dates: out };
  }

  if (!req.date) {
    return { ok: false, error: "Give a date, a range, or a list of dates" };
  }

  const start = dateOnly(req.date);
  const end = req.endDate ? dateOnly(req.endDate) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "That date isn't a real date" };
  }
  if (end < start) {
    return { ok: false, error: "The last day can't be before the first" };
  }

  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) {
    return {
      ok: false,
      error: `That's ${days} days. Block out a term at most — anything longer is a closure, not a block-out.`,
    };
  }

  let out: Date[] = [];
  for (let i = 0; i < days; i++) {
    out.push(new Date(start.getTime() + i * DAY_MS));
  }

  // Weekend skipping is a convenience for RANGES, where the weekends are
  // incidental — days swept up by "the 3rd to the 14th" that the centre
  // was never open for. A single date is a deliberate choice, the same
  // as naming one in a list, so it is never filtered: picking a Saturday
  // and being told the request was empty would be absurd.
  if (days > 1 && req.excludeWeekends !== false) {
    out = out.filter((d) => !isWeekend(d));
  }

  if (out.length === 0) {
    return { ok: false, error: "That range is all weekend — nothing to block out." };
  }

  return { ok: true, dates: out };
}
