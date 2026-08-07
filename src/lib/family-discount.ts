/**
 * Applying a family's discount to a fee.
 *
 * Sibling arrangements, staff rates, hardship. The rules here decide
 * what somebody is actually charged, so they're deliberately boring and
 * all in one place:
 *
 *  - Only ONE discount applies. Stacking a 20% sibling rate on a 50%
 *    staff rate is never what anyone meant, and the day it happens by
 *    accident nobody notices until the invoice goes out.
 *  - The most SPECIFIC wins: a discount for one room beats an
 *    all-rooms one, because it was written for this case.
 *  - Same specificity, the family gets the better of the two. If a
 *    centre has granted two overlapping discounts, the generous reading
 *    is the defensible one.
 *  - A discount can never take a fee below zero. A credit is a
 *    different thing and belongs in billing, not in a price.
 */

export interface DiscountRule {
  id: string;
  sessionType: string | null;
  kind: string;
  value: number;
  reason: string;
  startDate: Date | string;
  endDate: Date | string | null;
}

export interface DiscountOutcome {
  /** Cents actually payable, after the discount. */
  amountCents: number;
  /** Cents taken off. Zero when nothing applied. */
  discountCents: number;
  applied: { id: string; reason: string } | null;
}

const asTime = (d: Date | string) =>
  (d instanceof Date ? d : new Date(d)).getTime();

/** Discounts in force on `date` for this room, most specific first. */
export function activeDiscounts(
  rules: DiscountRule[],
  sessionType: string,
  date: Date,
): DiscountRule[] {
  const at = date.getTime();
  return rules
    .filter((r) => {
      if (r.sessionType !== null && r.sessionType !== sessionType) return false;
      if (asTime(r.startDate) > at) return false;
      // An end date is the last day the discount applies, not the first
      // day it doesn't — a family told "until 30 June" expects the 30th.
      if (r.endDate !== null && asTime(r.endDate) < at) return false;
      return true;
    })
    .sort((a, b) => {
      const specificity =
        (a.sessionType === null ? 1 : 0) - (b.sessionType === null ? 1 : 0);
      return specificity;
    });
}

/** What one rule takes off a fee, in cents. Never more than the fee. */
export function discountAmountCents(rule: DiscountRule, feeCents: number): number {
  if (feeCents <= 0) return 0;
  const raw =
    rule.kind === "percent"
      ? Math.round((feeCents * Math.min(Math.max(rule.value, 0), 100)) / 100)
      : Math.max(rule.value, 0);
  // A discount reduces a price to at most free. Anything beyond that is
  // a credit, which is billing's job, not a price's.
  return Math.min(raw, feeCents);
}

export function applyFamilyDiscount(
  feeCents: number,
  rules: DiscountRule[],
  sessionType: string,
  date: Date,
): DiscountOutcome {
  const candidates = activeDiscounts(rules, sessionType, date);
  if (candidates.length === 0 || feeCents <= 0) {
    return { amountCents: Math.max(feeCents, 0), discountCents: 0, applied: null };
  }

  // Most specific first; among equals, the one that helps the family
  // most. Never the sum of them.
  const topSpecificity = candidates[0].sessionType === null;
  const sameTier = candidates.filter(
    (c) => (c.sessionType === null) === topSpecificity,
  );

  let best = sameTier[0];
  let bestOff = discountAmountCents(best, feeCents);
  for (const c of sameTier.slice(1)) {
    const off = discountAmountCents(c, feeCents);
    if (off > bestOff) {
      best = c;
      bestOff = off;
    }
  }

  return {
    amountCents: feeCents - bestOff,
    discountCents: bestOff,
    applied: bestOff > 0 ? { id: best.id, reason: best.reason } : null,
  };
}
