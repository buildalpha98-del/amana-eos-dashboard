/**
 * Roster cost projection helpers.
 *
 * Pure functions split out of the API route so the client (and tests)
 * can re-use them. Used by `GET /api/roster/cost-projection` and the
 * `RosterCostBadge` in the per-service Weekly Shifts grid.
 *
 * 2026-05-02: introduced as the fifth Connecteam-style roster
 * deliverable. Surfaces a "this week's wage cost ≈ $X" chip above the
 * grid so coordinators can spot when a roster's running over-budget
 * before they hit Publish.
 */

/** Parse "HH:mm" → number of minutes from midnight. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Hours worked between two HH:mm strings on the same day. Negative or
 * zero ranges return 0 (defensive — the route already validates
 * `shiftEnd > shiftStart` at create-time, but bad rows from older data
 * shouldn't crash the projection).
 */
export function hoursBetween(start: string, end: string): number {
  const minutes = Math.max(0, timeToMinutes(end) - timeToMinutes(start));
  return minutes / 60;
}

export interface ShiftLike {
  userId: string | null;
  shiftStart: string;
  shiftEnd: string;
}

export interface CostBreakdownRow {
  userId: string;
  hours: number;
  payRate: number | null;
  cost: number | null; // null when we have hours but no contract
}

export interface CostProjection {
  totalHours: number;
  totalCost: number;
  /** Hours from shifts where the user has no active contract. Surfaced
   *  separately so the UI can warn "couldn't price these". */
  unpricedHours: number;
  byUser: CostBreakdownRow[];
}

/**
 * Aggregate hours per `userId` (skip open / unassigned shifts), join
 * against `payRateByUser` to produce a cost. Pure — no DB calls. Tests
 * mock both inputs.
 */
export function projectCost(
  shifts: ShiftLike[],
  payRateByUser: Map<string, number>,
): CostProjection {
  const hoursByUser = new Map<string, number>();
  for (const s of shifts) {
    if (!s.userId) continue;
    const h = hoursBetween(s.shiftStart, s.shiftEnd);
    if (h <= 0) continue;
    hoursByUser.set(s.userId, (hoursByUser.get(s.userId) ?? 0) + h);
  }

  let totalHours = 0;
  let totalCost = 0;
  let unpricedHours = 0;
  const byUser: CostBreakdownRow[] = [];

  for (const [userId, hours] of hoursByUser) {
    totalHours += hours;
    const rate = payRateByUser.get(userId);
    if (typeof rate === "number") {
      const cost = +(hours * rate).toFixed(2);
      totalCost += cost;
      byUser.push({ userId, hours, payRate: rate, cost });
    } else {
      unpricedHours += hours;
      byUser.push({ userId, hours, payRate: null, cost: null });
    }
  }

  // Sort: highest cost first; unpriced rows after the priced ones.
  byUser.sort((a, b) => {
    if (a.cost === null && b.cost === null) return b.hours - a.hours;
    if (a.cost === null) return 1;
    if (b.cost === null) return -1;
    return b.cost - a.cost;
  });

  return {
    totalHours: +totalHours.toFixed(2),
    totalCost: +totalCost.toFixed(2),
    unpricedHours: +unpricedHours.toFixed(2),
    byUser,
  };
}
