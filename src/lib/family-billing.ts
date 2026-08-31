/**
 * Billing arrangement for a family, and how to describe it.
 *
 * Pure module — no Prisma, no React — so the API can validate with the
 * same rules the UI renders, and both can be tested without a database.
 */

export const BILLING_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
] as const;

export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number]["value"];

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export interface BillingSettings {
  billingFrequency?: string | null;
  billingAnchorDay?: number | null;
  billingLimitCents?: number | null;
  billingNotes?: string | null;
}

export function isBillingFrequency(v: unknown): v is BillingFrequency {
  return BILLING_FREQUENCIES.some((f) => f.value === v);
}

/**
 * Valid range for the anchor day, which depends on the frequency.
 *
 * Monthly stops at 28 deliberately: a family billed on the 30th has no
 * billing date in February, and "nearest valid day" behaviour is the kind
 * of surprise that turns into a missed debit and a fee.
 */
export function anchorDayRange(frequency: string | null | undefined): {
  min: number;
  max: number;
} {
  return frequency === "monthly" ? { min: 1, max: 28 } : { min: 1, max: 7 };
}

export function anchorDayValid(
  frequency: string | null | undefined,
  day: number | null | undefined,
): boolean {
  if (day === null || day === undefined) return true; // not set yet
  if (!Number.isInteger(day)) return false;
  const { min, max } = anchorDayRange(frequency);
  return day >= min && day <= max;
}

/** Human label for the anchor day, given the frequency. */
export function anchorDayLabel(
  frequency: string | null | undefined,
  day: number | null | undefined,
): string | null {
  if (day === null || day === undefined) return null;
  if (frequency === "monthly") {
    return `Day ${day} of the month`;
  }
  return WEEKDAY_NAMES[day - 1] ?? null;
}

export function formatCents(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

/** "Fortnightly on Wednesday, capped at $250.00" */
export function describeBilling(s: BillingSettings): string {
  if (!s.billingFrequency) return "No billing arrangement set";

  const freq =
    BILLING_FREQUENCIES.find((f) => f.value === s.billingFrequency)?.label ??
    s.billingFrequency;
  const day = anchorDayLabel(s.billingFrequency, s.billingAnchorDay);
  const cap = formatCents(s.billingLimitCents);

  let out = freq;
  if (day) out += s.billingFrequency === "monthly" ? `, ${day.toLowerCase()}` : ` on ${day}`;
  if (cap) out += `, capped at ${cap}`;
  return out;
}

/**
 * Parse a dollar string ("120", "$120.50", "1,200") into whole cents.
 *
 * Returns null for empty input (meaning "no cap") and undefined for
 * something we couldn't read — the caller must tell those apart, because
 * silently treating a typo as "no limit" removes a control staff set on
 * purpose.
 */
export function parseDollarsToCents(
  input: string | null | undefined,
): number | null | undefined {
  if (input === null || input === undefined) return null;
  const trimmed = String(input).trim().replace(/[$,]/g, "");
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
  return Math.round(Number(trimmed) * 100);
}
