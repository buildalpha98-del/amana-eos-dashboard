/**
 * timeclock-pick — pure shift-selection logic for the time-clock APIs.
 *
 * Decides which `RosterShift` a "clock me in" or "clock me out" call
 * should attach to, given:
 *   - the user's shifts on the day in question (caller already
 *     filtered by userId + date),
 *   - the action (in / out),
 *   - the current time.
 *
 * Tolerance window: ±2h around the scheduled `shiftStart` for clock-in.
 * Clock-out has no such window — staff who run late should still be
 * able to close their shift hours after `shiftEnd`. Auto clock-out
 * cron is a v2 followup; today, leaving the row open is intentional.
 *
 * 2026-05-04: introduced as part of timeclock v1
 * (docs/superpowers/specs/2026-05-04-staff-timeclock-v1-design.md).
 */

/** Minimum clock-in eligibility window — staff can clock in at most
 *  this far before / after their scheduled `shiftStart`. */
export const CLOCK_IN_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h

export interface PickShift {
  id: string;
  date: Date;
  shiftStart: string; // "HH:mm"
  shiftEnd: string; // "HH:mm"
  actualStart: Date | null;
  actualEnd: Date | null;
}

export type PickResult =
  | { kind: "match"; shift: PickShift }
  | { kind: "ambiguous"; candidates: PickShift[] }
  | { kind: "none" };

/** Combine a `Date`-as-day + an "HH:mm" string into a single
 *  millisecond timestamp. */
export function shiftStartMs(shift: PickShift): number {
  const [h, m] = shift.shiftStart.split(":").map(Number);
  const d = new Date(shift.date);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

/**
 * Pick the eligible shift for a clock-in/out action against `now`.
 *
 * - **Clock-in eligibility**: |now - shiftStart| ≤ 2h **and** the
 *   shift hasn't already been clocked in (`actualStart === null`).
 *   Multiple matches → `ambiguous`. Zero → `none` (caller can fall
 *   back to unscheduled-clock-in).
 *
 * - **Clock-out eligibility**: the shift was clocked in
 *   (`actualStart !== null`) and not yet clocked out (`actualEnd === null`).
 *   No window; staff might forget and close hours later. Multiple
 *   open shifts is an unusual data shape but the function still
 *   returns `ambiguous` rather than picking arbitrarily.
 */
export function pickEligibleShift(
  shifts: PickShift[],
  now: Date,
  action: "in" | "out",
): PickResult {
  const nowMs = now.getTime();

  let candidates: PickShift[];
  if (action === "in") {
    candidates = shifts.filter((s) => {
      if (s.actualStart) return false; // already clocked in
      const startMs = shiftStartMs(s);
      return Math.abs(nowMs - startMs) <= CLOCK_IN_WINDOW_MS;
    });
  } else {
    candidates = shifts.filter((s) => s.actualStart && !s.actualEnd);
  }

  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) return { kind: "match", shift: candidates[0] };
  return { kind: "ambiguous", candidates };
}

/**
 * Infer the session type for an unscheduled walk-in, based on the
 * time-of-day. Used by `POST /api/roster/unscheduled-clock-in`.
 *
 * - Before 9am → BSC (Before-School Care)
 * - 9am-2pm   → VC  (Vacation Care)
 * - 2pm onward → ASC (After-School Care)
 *
 * The admin can correct this when reconciling the unscheduled row.
 */
export function inferSessionType(now: Date): "bsc" | "asc" | "vc" {
  const h = now.getHours();
  if (h < 9) return "bsc";
  if (h < 14) return "vc";
  return "asc";
}
