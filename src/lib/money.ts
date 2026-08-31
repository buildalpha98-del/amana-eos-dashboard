/**
 * Money arithmetic and ageing, in integer cents.
 *
 * ⚠️ WHY THIS EXISTS: the billing models store money as `Float`
 * (Statement.totalFees, amountPaid, balance, Payment.amount…). Floats
 * cannot represent most decimal amounts exactly — 0.1 + 0.2 is
 * 0.30000000000000004 — so summing a few hundred invoice lines drifts,
 * and a balance that should be 0 comes out as 0.0000000001 and shows as
 * outstanding. That's tolerable in a reporting view. It is NOT tolerable
 * once this system is the one actually invoicing families.
 *
 * Every calculation here converts to integer cents at the boundary, does
 * the arithmetic exactly, and converts back only to display. New billing
 * code should use these helpers rather than adding floats directly.
 *
 * Migrating the columns themselves to Int cents is a separate, bigger
 * change — flagged to Daniel 2026-07-31, cheapest to do before a year of
 * invoices exist.
 */

/** Dollars (possibly a float from the DB) → exact integer cents. */
export function toCents(dollars: number | null | undefined): number {
  if (dollars === null || dollars === undefined || Number.isNaN(dollars)) {
    return 0;
  }
  // Round HALF AWAY FROM ZERO, not Math.round.
  //
  // Math.round breaks ties toward +infinity, so -12.345 would give -1234
  // while +12.345 gives 1235 — a one-cent asymmetry between a charge and
  // a credit of the same size. Over a reconciliation run that shows up as
  // an unexplained imbalance.
  const cents = dollars * 100;
  return cents < 0 ? -Math.round(-cents) : Math.round(cents);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** "$1,234.50" — always two decimals, thousands separated. */
export function formatMoney(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = (abs / 100).toFixed(2);
  const [whole, frac] = s.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${grouped}.${frac}`;
}

/** Sum a list of dollar amounts without float drift. */
export function sumDollars(values: (number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + toCents(v), 0);
}

// ---------------------------------------------------------------------------
// Ageing
// ---------------------------------------------------------------------------

export const AGED_BUCKETS = [
  { key: "current", label: "Current", minDays: -Infinity, maxDays: 0 },
  { key: "d1_30", label: "1–30 days", minDays: 1, maxDays: 30 },
  { key: "d31_60", label: "31–60 days", minDays: 31, maxDays: 60 },
  { key: "d61_90", label: "61–90 days", minDays: 61, maxDays: 90 },
  { key: "d90_plus", label: "90+ days", minDays: 91, maxDays: Infinity },
] as const;

export type AgedBucketKey = (typeof AGED_BUCKETS)[number]["key"];

/**
 * Whole days a debt is overdue. Negative or zero means not yet due.
 *
 * Compared on calendar DATES, not timestamps: an invoice due today is not
 * "0.4 days overdue" at 10am, it's current. Using raw millisecond
 * differences would push same-day invoices into the 1–30 bucket depending
 * on the time of day the report was run.
 */
export function daysOverdue(
  dueDate: Date | string | null | undefined,
  asOf: Date,
): number {
  if (!dueDate) return 0;
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const dueDay = Date.UTC(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate(),
  );
  const asOfDay = Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate(),
  );
  return Math.round((asOfDay - dueDay) / dayMs);
}

export function bucketFor(days: number): AgedBucketKey {
  for (const b of AGED_BUCKETS) {
    if (days >= b.minDays && days <= b.maxDays) return b.key;
  }
  return "current";
}

export interface AgeableDebt {
  dueDate: Date | string | null | undefined;
  /** Outstanding amount in DOLLARS, as stored. */
  balance: number | null | undefined;
}

export type AgedTotals = Record<AgedBucketKey, number> & { total: number };

/**
 * Bucket a set of debts by age. All figures returned in CENTS.
 *
 * A debt with no due date counts as current rather than being dropped —
 * silently excluding it would understate what a family owes, which is the
 * one error an aged-debtors report must not make.
 */
export function ageDebts(debts: AgeableDebt[], asOf: Date): AgedTotals {
  const out = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
    total: 0,
  } as AgedTotals;

  for (const d of debts) {
    const cents = toCents(d.balance);
    // Credits and settled invoices don't belong in an ageing report.
    if (cents <= 0) continue;
    const key = bucketFor(daysOverdue(d.dueDate, asOf));
    out[key] += cents;
    out.total += cents;
  }
  return out;
}
