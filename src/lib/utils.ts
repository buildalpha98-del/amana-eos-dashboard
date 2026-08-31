import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateAU(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─── EOS quarters (Australian financial year) ────────────────────────
//
// 2026-07-28, per Daniel: "For EOS work of financial year not calendar
// year for rocks and other things." EOS quarters now follow the AU
// financial year (1 Jul – 30 Jun) rather than the calendar year:
//
//   Q1 = Jul–Sep   Q2 = Oct–Dec   Q3 = Jan–Mar   Q4 = Apr–Jun
//
// The label carries the FY it belongs to, named by the year the FY ENDS
// (the Australian convention): Jul 2026 – Jun 2027 is FY27.
//
//   Jul–Sep 2026 → "Q1-FY27"        (was "Q3-2026")
//   Apr–Jun 2027 → "Q4-FY27"        (was "Q2-2027")
//
// The "-FY" marker is deliberate: the previous calendar labels were
// "Q3-2026", so an un-migrated value is instantly distinguishable from a
// migrated one. Existing Rock.quarter rows were remapped 1:1 by
// prisma/migrations/20260728100000_rock_quarter_financial_year.

/** Financial year a date falls in, named by its ENDING year. Jul 2026 → 27. */
function financialYearShort(date: Date): number {
  const year = date.getFullYear();
  // Jul (month index 6) onwards belongs to the FY ending next calendar year.
  const fyEndYear = date.getMonth() >= 6 ? year + 1 : year;
  return fyEndYear % 100;
}

/** FY quarter number (1–4) for a date. Jul–Sep = 1 … Apr–Jun = 4. */
function financialQuarterNumber(date: Date): number {
  // Shift the month so July becomes index 0, then group in threes.
  return Math.floor(((date.getMonth() + 6) % 12) / 3) + 1;
}

/**
 * Canonical Rock.quarter label for a date — "Q1-FY27" (hyphen, no space).
 * ALWAYS use this instead of building the string inline: a hand-rolled
 * variant silently matched zero rocks in the dashboard aggregator and
 * health-score computations.
 */
export function quarterLabel(date: Date): string {
  const q = financialQuarterNumber(date);
  const fy = String(financialYearShort(date)).padStart(2, "0");
  return `Q${q}-FY${fy}`;
}

export function getCurrentQuarter(): string {
  return quarterLabel(new Date());
}

/**
 * Shift a quarter string by N quarters. Positive N = future, negative = past.
 * Handles FY rollover both directions. Returns the same "Q<n>-FY<yy>" shape.
 *   shiftQuarter("Q1-FY27", -1)  → "Q4-FY26"
 *   shiftQuarter("Q4-FY27",  1)  → "Q1-FY28"
 * Unparseable input is returned unchanged rather than throwing — callers
 * pass user/DB data and a bad label must not take a page down.
 */
export function shiftQuarter(quarter: string, delta: number): string {
  const match = /^Q([1-4])-FY(\d{2})$/.exec(quarter);
  if (!match) return quarter;
  const qn = Number(match[1]);
  const fy = Number(match[2]);
  // Absolute quarter index (fy*4 + q-1), shift, unpack.
  const absolute = fy * 4 + (qn - 1) + delta;
  const newFy = Math.floor(absolute / 4);
  const newQ = (((absolute % 4) + 4) % 4) + 1; // 1..4
  return `Q${newQ}-FY${String(((newFy % 100) + 100) % 100).padStart(2, "0")}`;
}

/**
 * Start (inclusive) and end (exclusive) dates of an FY quarter label.
 * Needed by anything reasoning about elapsed progress through a quarter —
 * under the FY calendar Q1 starts in JULY, not January.
 *   quarterDateRange("Q1-FY27") → { start: 2026-07-01, end: 2026-10-01 }
 * Returns null for an unparseable label so callers can skip rather than
 * compute against a bogus range.
 */
export function quarterDateRange(
  quarter: string,
): { start: Date; end: Date } | null {
  const match = /^Q([1-4])-FY(\d{2})$/.exec(quarter);
  if (!match) return null;
  const qn = Number(match[1]);
  const fyEndYear = 2000 + Number(match[2]);
  // Q1 starts July of the year BEFORE the FY's ending year.
  const startMonthAbs = 6 + (qn - 1) * 3; // 6=Jul, 9=Oct, 12=Jan(+1y), 15=Apr(+1y)
  const startYear = fyEndYear - 1 + Math.floor(startMonthAbs / 12);
  const startMonth = startMonthAbs % 12;
  const start = new Date(startYear, startMonth, 1);
  const end = new Date(startYear, startMonth + 3, 1);
  return { start, end };
}

/**
 * Sort comparator for FY quarter labels, newest first.
 * Naive `Number(part)` parsing breaks on the "FY27" half, so share this
 * rather than re-deriving it per call site.
 */
export function compareQuartersDesc(a: string, b: string): number {
  const pa = /^Q([1-4])-FY(\d{2})$/.exec(a);
  const pb = /^Q([1-4])-FY(\d{2})$/.exec(b);
  // Unparseable labels sort last but keep a stable relative order.
  if (!pa && !pb) return a < b ? 1 : a > b ? -1 : 0;
  if (!pa) return 1;
  if (!pb) return -1;
  const fyA = Number(pa[2]);
  const fyB = Number(pb[2]);
  if (fyA !== fyB) return fyB - fyA;
  return Number(pb[1]) - Number(pa[1]);
}

/** Human-readable quarter label. "Q1-FY27" → "Q1 FY27". */
export function formatQuarter(quarter: string): string {
  return quarter.replace("-", " ");
}

/**
 * Remap a legacy calendar-quarter label to its financial-year equivalent.
 * Exported so the same rule is testable and reusable if stale labels turn
 * up from an old export or an unmigrated environment.
 *   "Q3-2026" (Jul–Sep 2026) → "Q1-FY27"
 *   "Q1-2027" (Jan–Mar 2027) → "Q3-FY27"
 * Anything already in FY form, or unrecognised, is returned unchanged.
 */
export function calendarQuarterToFinancial(quarter: string): string {
  const match = /^Q([1-4])-(\d{4})$/.exec(quarter);
  if (!match) return quarter; // already FY-form, or not a quarter at all
  const calQ = Number(match[1]);
  const calYear = Number(match[2]);
  // Calendar Q1(Jan-Mar)→FY Q3 same FY; Q2(Apr-Jun)→FY Q4 same FY;
  // Q3(Jul-Sep)→FY Q1 of next FY; Q4(Oct-Dec)→FY Q2 of next FY.
  const fyQ = calQ <= 2 ? calQ + 2 : calQ - 2;
  const fyEndYear = calQ <= 2 ? calYear : calYear + 1;
  return `Q${fyQ}-FY${String(fyEndYear % 100).padStart(2, "0")}`;
}

export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format a Date as `YYYY-MM-DD` using its LOCAL calendar day.
 *
 * Use this — not `date.toISOString().split("T")[0]` — whenever you need the
 * local date of a local-time Date (e.g. the Monday from `getWeekStart`). In
 * positive-UTC-offset timezones (AEST/AEDT, UTC+10/+11) a local-midnight Date
 * serialises to the PREVIOUS day under `toISOString()`, which silently shifts
 * week grids back a day — the "Monday column shows nothing" bug.
 */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The Monday 00:00 of the week BEFORE `date`'s week. Used by the L10
 * meeting's To-Do Review section, which reviews last week's commitments
 * (not this week's — last week is what people committed to AT last
 * week's meeting and should be marked done/not-done at this one).
 */
export function getPreviousWeekStart(date: Date = new Date()): Date {
  const current = getWeekStart(date);
  current.setDate(current.getDate() - 7);
  return current;
}
