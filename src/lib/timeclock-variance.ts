/**
 * Per-shift variance calculation for the weekly roster grid.
 *
 * Compares the staff's actual clock-in time against the scheduled
 * `shiftStart`, and produces a small visible verdict:
 *
 *  - **none**     — no actual clock-in yet (future shift, or staff
 *                   forgot to clock in / hasn't arrived yet)
 *  - **active**   — clocked in, not yet clocked out (live shift)
 *  - **on-time**  — actual within ±5 minutes of scheduled start
 *  - **late**     — actual 6–29 min after scheduled start
 *  - **very-late** — actual 30+ min after scheduled start
 *  - **early**    — actual >5 min before scheduled start (worth
 *                   surfacing; could mean the schedule is wrong, or
 *                   the staff is genuinely early)
 *
 * The "actual end vs scheduled end" delta is exposed via
 * `endDeltaMin` for the tooltip but doesn't drive the colour today
 * — under-time vs over-time has different operational meanings (one
 * is a payroll question, the other a coverage question) and we
 * shouldn't conflate them in a single pill.
 *
 * 2026-05-04: timeclock v1, sub-PR 5.
 */

export type VarianceStatus =
  | "none"
  | "active"
  | "on-time"
  | "early"
  | "late"
  | "very-late";

export interface VarianceResult {
  status: VarianceStatus;
  /** Minutes between actualStart and scheduled shiftStart. Positive
   *  = late; negative = early; null when no actualStart. */
  startDeltaMin: number | null;
  /** Minutes between actualEnd and scheduled shiftEnd. Positive =
   *  over (stayed late); negative = under (left early); null when
   *  no actualEnd or no actualStart. */
  endDeltaMin: number | null;
}

interface VarianceInput {
  /** YYYY-MM-DD or any ISO timestamp on the shift's day. */
  date: string | Date;
  /** "HH:mm" 24-hour. */
  shiftStart: string;
  /** "HH:mm" 24-hour. */
  shiftEnd: string;
  /** ISO timestamp of actual clock-in, or null. */
  actualStart: string | Date | null;
  /** ISO timestamp of actual clock-out, or null. */
  actualEnd: string | Date | null;
}

function combineDateTime(date: string | Date, hhmm: string): Date {
  const d = new Date(date);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function diffMinutes(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60_000);
}

/** Pure variance calculation — exported for unit tests. */
export function computeVariance(input: VarianceInput): VarianceResult {
  if (!input.actualStart) {
    return { status: "none", startDeltaMin: null, endDeltaMin: null };
  }

  const scheduledStart = combineDateTime(input.date, input.shiftStart);
  const scheduledEnd = combineDateTime(input.date, input.shiftEnd);
  const actualStart = new Date(input.actualStart);
  const startDeltaMin = diffMinutes(actualStart, scheduledStart);

  const actualEnd = input.actualEnd ? new Date(input.actualEnd) : null;
  const endDeltaMin = actualEnd ? diffMinutes(actualEnd, scheduledEnd) : null;

  if (!actualEnd) {
    // Currently clocked in. We don't show an early/late verdict
    // until the shift closes — coordinators care about "is this
    // shift live" more than "did this person arrive on time" when
    // they're glancing at the grid mid-shift.
    return { status: "active", startDeltaMin, endDeltaMin };
  }

  if (startDeltaMin <= -6) return { status: "early", startDeltaMin, endDeltaMin };
  if (startDeltaMin <= 5) return { status: "on-time", startDeltaMin, endDeltaMin };
  if (startDeltaMin <= 29) return { status: "late", startDeltaMin, endDeltaMin };
  return { status: "very-late", startDeltaMin, endDeltaMin };
}

/** Short pill label, e.g. "+0", "+12m", "-3m", "active", "—". */
export function varianceLabel(v: VarianceResult): string {
  if (v.status === "none") return "—";
  if (v.status === "active") return "active";
  const d = v.startDeltaMin ?? 0;
  if (d === 0) return "+0";
  return `${d > 0 ? "+" : ""}${d}m`;
}
