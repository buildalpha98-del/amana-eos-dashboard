/**
 * Payment processing fees disclosed on the enrolment form.
 *
 * ⚠️ THESE FIGURES ARE LEGALLY SENSITIVE — they are a representation to a
 * consumer about what they will be charged. Under the Australian Consumer
 * Law, understating them is misleading conduct, and under the RBA's
 * surcharging standard a surcharge must not exceed the cost of acceptance.
 * They came from Daniel's recollection ("I think from memory") on
 * 2026-07-30 and MUST be reconciled against the actual merchant agreement
 * before this goes in front of families.
 *
 * Kept in one module so the form, the fee schedule, any future invoice
 * template and the direct debit request agreement can never quote
 * different numbers to the same parent.
 */

export interface PaymentFee {
  /** Percentage of the transaction, or null for a flat fee. */
  percent: number | null;
  /** Flat amount in dollars, or null for a percentage fee. */
  flat: number | null;
  /** Charged when a payment is declined or reversed. */
  dishonourFee: number;
}

export const DIRECT_DEBIT_FEE: PaymentFee = {
  percent: 0.75,
  flat: null,
  dishonourFee: 2.5,
};

export const CREDIT_CARD_FEE: PaymentFee = {
  percent: null,
  flat: 2.5,
  dishonourFee: 2.5,
};

const money = (n: number) =>
  n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;

/** "0.75% of each payment" / "$2.50 per payment" */
export function feeDescription(fee: PaymentFee): string {
  if (fee.percent !== null) return `${fee.percent}% of each payment`;
  return `${money(fee.flat ?? 0)} per payment`;
}

export function dishonourDescription(fee: PaymentFee): string {
  return `${money(fee.dishonourFee)} for each failed or declined payment`;
}

/** Worked example, so a percentage means something concrete to a parent. */
export function feeExample(fee: PaymentFee, amount = 100): string | null {
  if (fee.percent === null) return null;
  const charge = (amount * fee.percent) / 100;
  return `On a ${money(amount)} payment that's ${money(
    Number(charge.toFixed(2)),
  )}.`;
}
