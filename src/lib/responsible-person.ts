/**
 * Pure helpers for the responsible-person register.
 *
 * Shared by the API route (defaulting session times, validating input) and
 * the client grid / PDF export (labels, range expansion, cell indexing).
 * Deliberately free of React + Prisma runtime imports so it's trivially
 * unit-testable and safe to import from both server and client bundles.
 *
 * 2026-06-11: introduced with the RP register (A&R breach remediation).
 */

export const RP_SESSION_TYPES = ["bsc", "asc", "vc"] as const;
export type RpSessionType = (typeof RP_SESSION_TYPES)[number];

export const RP_SESSION_LABELS: Record<RpSessionType, string> = {
  bsc: "Before School Care",
  asc: "After School Care",
  vc: "Vacation Care",
};

export const RP_SESSION_SHORT: Record<RpSessionType, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

/**
 * Federal-default session windows, used when a service hasn't customised its
 * `sessionTimes`. Matches the windows specified for the register: BSC
 * 06:30–08:30, ASC 15:00–18:30, VC full-day.
 */
export const DEFAULT_SESSION_TIMES: Record<
  RpSessionType,
  { start: string; end: string }
> = {
  bsc: { start: "06:30", end: "08:30" },
  asc: { start: "15:00", end: "18:30" },
  vc: { start: "06:30", end: "18:30" },
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Type guard: is `v` an "HH:mm" 24h time string. */
export function isHhMm(v: unknown): v is string {
  return typeof v === "string" && HHMM.test(v);
}

/** Type guard: is `v` a YYYY-MM-DD date string. */
export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && ISO_DATE.test(v);
}

/** Type guard: is `v` one of the three session types. */
export function isRpSessionType(v: unknown): v is RpSessionType {
  return (
    typeof v === "string" &&
    (RP_SESSION_TYPES as readonly string[]).includes(v)
  );
}

/**
 * Resolve the default on/off times for a session, preferring the service's
 * configured `sessionTimes` JSON and falling back to the federal default.
 * Defensive against arbitrary JSON shapes — anything that isn't a valid
 * HH:mm falls back.
 */
export function defaultTimesForSession(
  sessionType: RpSessionType,
  sessionTimes?: unknown,
): { start: string; end: string } {
  const fallback = DEFAULT_SESSION_TIMES[sessionType];
  if (!sessionTimes || typeof sessionTimes !== "object") return fallback;
  const block = (sessionTimes as Record<string, unknown>)[sessionType];
  if (!block || typeof block !== "object") return fallback;
  const { start, end } = block as { start?: unknown; end?: unknown };
  return {
    start: isHhMm(start) ? start : fallback.start,
    end: isHhMm(end) ? end : fallback.end,
  };
}

/**
 * Expand an inclusive date range into YYYY-MM-DD strings. Defaults to
 * weekdays only (Mon–Fri) — OSHC doesn't operate weekends, so the register
 * grid and PDF only care about weekdays. Iterates in UTC to stay free of
 * DST drift. Returns [] when `from` > `to` or either is malformed.
 */
export function eachDateInRange(
  fromIso: string,
  toIso: string,
  opts: { weekdaysOnly?: boolean } = {},
): string[] {
  if (!isIsoDate(fromIso) || !isIsoDate(toIso)) return [];
  const { weekdaysOnly = true } = opts;
  const start = new Date(`${fromIso}T00:00:00.000Z`);
  const end = new Date(`${toIso}T00:00:00.000Z`);
  if (start.getTime() > end.getTime()) return [];
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const dow = cursor.getUTCDay(); // 0 Sun … 6 Sat
    if (!weekdaysOnly || (dow !== 0 && dow !== 6)) {
      out.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** A minimal register-entry shape the indexer needs. */
export interface IndexableEntry {
  date: string; // YYYY-MM-DD or ISO — only the first 10 chars are used
  sessionType: RpSessionType;
}

/** Stable composite key for a (date, session) grid cell. */
export function cellKey(dateIso: string, sessionType: RpSessionType): string {
  return `${dateIso.slice(0, 10)}|${sessionType}`;
}

/**
 * Index register entries by `${date}|${sessionType}` for O(1) per-cell
 * lookups in the grid. Last-write-wins on duplicate keys (the DB unique
 * constraint guarantees one, but the client shouldn't crash on two).
 */
export function indexEntriesByCell<T extends IndexableEntry>(
  entries: T[],
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const e of entries) {
    out[cellKey(e.date, e.sessionType)] = e;
  }
  return out;
}
