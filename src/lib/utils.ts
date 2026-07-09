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

export function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q}-${now.getFullYear()}`;
}

/**
 * Shift a quarter string by N quarters. Positive N = future, negative = past.
 * Handles year rollover both directions. Returns the same "Q<n>-<yyyy>" shape.
 *   shiftQuarter("Q1-2026", -1)  → "Q4-2025"
 *   shiftQuarter("Q4-2026",  1)  → "Q1-2027"
 */
export function shiftQuarter(quarter: string, delta: number): string {
  const [q, y] = quarter.split("-");
  const qn = Number(q.slice(1));
  const yn = Number(y);
  if (!Number.isFinite(qn) || !Number.isFinite(yn)) return quarter;
  // Convert to an absolute "quarter index" (year*4 + q-1), shift, unpack.
  const absolute = yn * 4 + (qn - 1) + delta;
  const newYear = Math.floor(absolute / 4);
  const newQ = ((absolute % 4) + 4) % 4 + 1; // 1..4
  return `Q${newQ}-${newYear}`;
}

/** Human-readable quarter label. "Q3-2026" → "Q3 2026". */
export function formatQuarter(quarter: string): string {
  return quarter.replace("-", " ");
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
