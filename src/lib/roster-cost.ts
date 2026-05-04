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
 *
 * 2026-05-04 (mid-week pay-rate proration): the original v1 picked
 * the most-recent active `EmploymentContract.payRate` and applied it
 * to the entire week. When a rate change lands mid-week (e.g. an
 * award increase effective Wednesday) the projection over- or
 * under-stated the actual wage cost. Now the cost is computed
 * per-shift against the contract whose window contains the shift's
 * date, and the per-user breakdown surfaces `proratedHours` so the
 * UI can flag rows that crossed a rate boundary.
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
  /** YYYY-MM-DD or Date (db @db.Date). */
  date: Date | string;
  shiftStart: string;
  shiftEnd: string;
}

/**
 * A contract's effective window for cost calculation. Only contracts
 * whose status the API considers "in force" (today: `active` —
 * superseded contracts are still loaded so we can price shifts that
 * fell inside their window before the rate change) end up here.
 */
export interface ContractWindow {
  userId: string;
  payRate: number;
  /** Date the contract took effect (inclusive). */
  startDate: Date;
  /** Day after which the contract no longer applies. `null` = open-ended. */
  endDate: Date | null;
}

export interface CostBreakdownRow {
  userId: string;
  hours: number;
  /**
   * Most recent rate effective during the week. Null when the user
   * has no contract overlapping any of their scheduled shifts.
   *
   * Note: when the user crossed a mid-week rate change, this is the
   * NEWER (post-change) rate. The pre-change hours show in
   * `proratedHours`. The `cost` field uses the per-shift correct
   * rate either way.
   */
  payRate: number | null;
  cost: number | null; // null when we have hours but no contract at all
  /** Hours that priced at a rate different from `payRate`. */
  proratedHours: number;
}

export interface CostProjection {
  totalHours: number;
  totalCost: number;
  /** Hours from shifts where the user has no contract on that date. */
  unpricedHours: number;
  byUser: CostBreakdownRow[];
}

/**
 * Find the contract whose effective window contains `shiftDate`. When
 * multiple windows match (overlapping contracts), the one with the
 * latest `startDate` wins — that's the "most recently issued" rule
 * the rest of the system uses for deduplication.
 */
export function payRateForShift(
  contracts: ContractWindow[],
  userId: string,
  shiftDate: Date,
): number | null {
  let best: ContractWindow | null = null;
  for (const c of contracts) {
    if (c.userId !== userId) continue;
    if (c.startDate > shiftDate) continue;
    if (c.endDate !== null && c.endDate < shiftDate) continue;
    if (!best || c.startDate > best.startDate) best = c;
  }
  return best?.payRate ?? null;
}

function toShiftDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  // Treat raw YYYY-MM-DD as UTC midnight so it lines up with how
  // Prisma materialises @db.Date columns.
  return new Date(`${d}T00:00:00Z`);
}

/**
 * Per-shift cost projection. For each scheduled shift, looks up the
 * contract effective on that date and accumulates hours × rate. Open
 * (unassigned) shifts and zero-length shifts are skipped.
 *
 * When a user's hours straddled a mid-week rate change, the per-user
 * row reports the post-change rate as `payRate` and the pre-change
 * hours as `proratedHours`. The `cost` field is always the correctly
 * prorated total.
 */
export function projectCost(
  shifts: ShiftLike[],
  contracts: ContractWindow[],
): CostProjection {
  // Bucket per (userId, rate) so we can detect mid-week rate changes.
  // Map<userId, Map<rateOrSentinel, hours>>. We store the sentinel
  // `NaN` for unpriced hours.
  const byUserByRate = new Map<string, Map<number, number>>();

  for (const s of shifts) {
    if (!s.userId) continue;
    const h = hoursBetween(s.shiftStart, s.shiftEnd);
    if (h <= 0) continue;
    const date = toShiftDate(s.date);
    const rate = payRateForShift(contracts, s.userId, date);

    const userMap = byUserByRate.get(s.userId) ?? new Map<number, number>();
    const key = rate === null ? Number.NaN : rate;
    userMap.set(key, (userMap.get(key) ?? 0) + h);
    byUserByRate.set(s.userId, userMap);
  }

  let totalHours = 0;
  let totalCost = 0;
  let unpricedHours = 0;
  const byUser: CostBreakdownRow[] = [];

  for (const [userId, rateBuckets] of byUserByRate) {
    let userHours = 0;
    let userCost = 0;
    let userUnpriced = 0;
    let primaryRate: number | null = null;
    let primaryStartDate = -Infinity;
    let proratedHours = 0;

    // Pick the "primary" rate = the rate from the contract with the
    // latest startDate among those that priced any of the user's
    // hours this week. That matches what staff would expect the chip
    // to render for "what's my current rate".
    for (const rate of rateBuckets.keys()) {
      if (Number.isNaN(rate)) continue;
      const c = contracts.find(
        (x) => x.userId === userId && x.payRate === rate,
      );
      if (c && c.startDate.getTime() > primaryStartDate) {
        primaryStartDate = c.startDate.getTime();
        primaryRate = rate;
      }
    }

    for (const [rate, hours] of rateBuckets) {
      userHours += hours;
      if (Number.isNaN(rate)) {
        userUnpriced += hours;
        continue;
      }
      userCost += hours * rate;
      if (primaryRate !== null && rate !== primaryRate) {
        proratedHours += hours;
      }
    }

    totalHours += userHours;
    totalCost += userCost;
    unpricedHours += userUnpriced;

    const allUnpriced = userUnpriced === userHours;
    byUser.push({
      userId,
      hours: +userHours.toFixed(2),
      payRate: primaryRate,
      cost: allUnpriced ? null : +userCost.toFixed(2),
      proratedHours: +proratedHours.toFixed(2),
    });
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
