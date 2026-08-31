/**
 * A centre's session times — the windows of care it sells.
 *
 * This is the catalogue, not the price and not the room. A centre says
 * "we run 06:30–09:00, 15:00–18:30 and 07:00–18:00", and every fee in
 * every room then picks one of those windows as its Session of Care.
 * Setting it up once at the centre is what stops the same window being
 * retyped into six rooms and drifting by fifteen minutes in one of them.
 *
 * Why it's a catalogue rather than free start/end on each fee: the
 * window is what gets reported to CCS as the session of care, so two
 * fees that are meant to be the same session have to be *identically*
 * the same session. Free-typed times can't promise that; a foreign key
 * can.
 *
 * Times are "HH:mm" strings in the centre's local time, deliberately.
 * These are wall-clock opening hours — 15:00 means three in the
 * afternoon on whatever day it is, through daylight saving in both
 * directions. Storing them as instants would be wrong twice a year.
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight, or null if the string isn't a valid HH:mm. */
export function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || !HHMM.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Length of the window in minutes, or null if either end is unparseable
 * or the window doesn't move forward.
 *
 * A session that ends before it starts is rejected rather than wrapped
 * to the next day. OSHC doesn't run overnight, so a 18:00–06:30 entry is
 * always a typo — and silently treating it as a 12.5-hour session would
 * put a 12.5-hour session of care on a CCS claim.
 */
export function durationMinutes(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return null;
  if (e <= s) return null;
  return e - s;
}

/**
 * "2.5 hours" — the label under each row in the editor.
 *
 * Whole hours lose the decimal ("11 hours", not "11.0 hours") because
 * that's how the number gets read aloud.
 */
export function formatDuration(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const mins = durationMinutes(start, end);
  if (mins === null) return null;
  const hours = mins / 60;
  // Number() strips the trailing zero "2.50" would otherwise carry,
  // without the guesswork of trimming the string by hand.
  const text = Number.isInteger(hours)
    ? String(hours)
    : String(Number(hours.toFixed(2)));
  return `${text} ${hours === 1 ? "hour" : "hours"}`;
}

/**
 * "15:00-18:30 (3.50H)" — how a session of care reads in the fees
 * matrix, where the hours matter more than the prose.
 *
 * Always two decimal places here: this column is scanned down, and
 * ragged decimals are harder to compare than a trailing zero.
 */
export function formatSessionOfCare(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const mins = durationMinutes(start, end);
  if (mins === null) return `${start ?? "?"}-${end ?? "?"}`;
  return `${start}-${end} (${(mins / 60).toFixed(2)}H)`;
}

/** Whether a start/end pair is a usable session window. */
export function isValidWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  return durationMinutes(start, end) !== null;
}

/**
 * Why a window is rejected, phrased for the person who typed it.
 *
 * Returns null when the window is fine. Separate from `isValidWindow`
 * because the API needs a reason to put in the 400 and the form needs
 * one to put under the field.
 */
export function describeWindowProblem(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!start?.trim() || !end?.trim()) return "Both a start and an end time are needed.";
  if (toMinutes(start) === null) return `"${start}" isn't a 24-hour time — try 06:30.`;
  if (toMinutes(end) === null) return `"${end}" isn't a 24-hour time — try 18:00.`;
  if (durationMinutes(start, end) === null) {
    return "The end time has to be after the start time.";
  }
  return null;
}

export interface SessionTimeLike {
  id: string;
  start: string;
  end: string;
  label: string | null;
}

/**
 * How a session time reads in a dropdown: its name if it has one, then
 * the window and the hours.
 *
 * The label is optional because most centres don't name these — they
 * think in times. When one does ("Ramadan Care"), the name leads,
 * because that's what they'll be looking for in the list.
 */
export function sessionTimeOptionLabel(s: SessionTimeLike): string {
  const window = formatSessionOfCare(s.start, s.end);
  return s.label?.trim() ? `${s.label.trim()} — ${window}` : window;
}

/** Catalogue order: earliest start first, then shortest first. */
export function compareSessionTimes(
  a: { start: string; end: string },
  b: { start: string; end: string },
): number {
  const as = toMinutes(a.start) ?? 0;
  const bs = toMinutes(b.start) ?? 0;
  if (as !== bs) return as - bs;
  return (durationMinutes(a.start, a.end) ?? 0) - (durationMinutes(b.start, b.end) ?? 0);
}
