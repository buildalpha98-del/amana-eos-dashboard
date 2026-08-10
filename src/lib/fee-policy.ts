/**
 * Per-centre fee policy — everything a family gets charged that ISN'T
 * the session fee.
 *
 * Rooms & fees already answers "what does a Tuesday afternoon cost".
 * It has never answered any of the questions that actually generate the
 * awkward phone calls: what happens when a parent arrives at 6:45pm,
 * what an unnotified absence costs, whether a cancelled casual spot is
 * refunded, what the enrolment fee is. Those were either hardcoded,
 * kept in someone's head, or written on a fee schedule PDF that no
 * longer matches what the system charges.
 *
 * Every field here is OPTIONAL and every default is "don't charge".
 * Writing this settings blob for the first time changes nothing until a
 * centre turns something on — the same rule `app-settings.ts` follows.
 * That matters more here than anywhere else in the app: a default that
 * silently starts billing families would be the worst bug this codebase
 * could ship.
 *
 * Money is in CENTS throughout, for the same reason it is in
 * `feeTierSchema` — these amounts get multiplied, summed and compared
 * against CCS entitlements, and floats and money don't mix.
 */

import { z } from "zod";

/** Ceiling on any single charge. A $1,000 late fee is a typo, not a policy. */
const MAX_CENTS = 1_000_00;

const centsField = z.number().int().min(0).max(MAX_CENTS);

/**
 * Late collection — the one every OSHC service needs and no two charge
 * the same way.
 *
 * `graceMinutes` is separate from the rate because the grace period is a
 * kindness decision and the rate is a cost-recovery one; centres change
 * them independently. Charging is off by default: a service that hasn't
 * configured this should record the lateness (which the sign-out already
 * does) without inventing a fee.
 */
export const lateCollectionFeeSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * flat        — one charge however late they are.
   * per_minute  — charge × minutes late.
   * per_block   — charge × blocks started, `blockMinutes` long. The most
   *               common OSHC shape ("$15 per 15 minutes or part thereof")
   *               and the reason `per_minute` alone isn't enough.
   */
  basis: z.enum(["flat", "per_minute", "per_block"]).default("per_block"),
  amountCents: centsField.default(0),
  /** Only meaningful for `per_block`. 15 minutes is the sector norm. */
  blockMinutes: z.number().int().min(1).max(120).default(15),
  /** Minutes after the room's close time before anything is charged. */
  graceMinutes: z.number().int().min(0).max(120).default(0),
  /**
   * A cap, because `per_minute` with no ceiling produces a $300 invoice
   * for a parent stuck on a motorway, which no centre actually wants to
   * send and every centre forgets to prevent.
   */
  maxPerOccurrenceCents: centsField.optional(),
});

/**
 * What an absence costs.
 *
 * The important distinction is NOTIFIED versus not. Under CCS a service
 * can claim for an absence, so most centres charge the full fee either
 * way — but the ones that don't, don't as a deliberate goodwill policy
 * for families who let them know. Keeping the two rates separate is what
 * lets a centre reward the phone call.
 */
export const absenceChargingSchema = z.object({
  /**
   * full     — charge the session fee (the CCS-claimable default).
   * none     — charge nothing.
   * percent  — charge `percentOfFee` of the session fee.
   */
  notified: z.enum(["full", "none", "percent"]).default("full"),
  notifiedPercent: z.number().int().min(0).max(100).default(100),
  unnotified: z.enum(["full", "none", "percent"]).default("full"),
  unnotifiedPercent: z.number().int().min(0).max(100).default(100),
  /**
   * How much notice counts as "notified". Hours rather than a cut-off
   * time, because the answer differs per room: before-school care needs
   * the night before, after-school care needs the morning.
   */
  notifyHours: z.number().int().min(0).max(168).default(12),
  /**
   * An additional flat charge for a child who simply doesn't arrive —
   * the roll has to be reconciled and someone has to ring around, which
   * is a real cost that the session fee doesn't cover.
   */
  noShowFeeCents: centsField.optional(),
});

/**
 * Cancelling a casual booking.
 *
 * `blockCasualCancellation` in `service-settings.ts` decides whether a
 * family CAN cancel; this decides what it costs when they do. The two
 * are deliberately separate — a centre that allows cancellation but
 * charges for a late one is the common case, and folding them together
 * would force it to pick.
 */
export const cancellationFeeSchema = z.object({
  enabled: z.boolean().default(false),
  /** Cancellations inside this window attract the fee. */
  withinHours: z.number().int().min(0).max(336).default(24),
  /** flat charge, or a percentage of the session fee. */
  basis: z.enum(["flat", "percent_of_fee"]).default("percent_of_fee"),
  amountCents: centsField.default(0),
  percentOfFee: z.number().int().min(0).max(100).default(100),
});

/**
 * One-off charges at the start of the relationship.
 *
 * `perChild` matters: an enrolment fee charged per child and one charged
 * per family differ by a factor of three for a typical Amana family, and
 * getting it wrong is a refund conversation.
 */
export const onboardingFeesSchema = z.object({
  enrolmentFeeCents: centsField.optional(),
  enrolmentFeePerChild: z.boolean().default(false),
  /** Refundable holding deposit, returned on exit. */
  bondCents: centsField.optional(),
  bondRefundable: z.boolean().default(true),
  /** Charged annually rather than once — some centres run it per FY. */
  annualAdminFeeCents: centsField.optional(),
});

/**
 * How and when money is taken.
 *
 * This does NOT move money — nothing here talks to a payment gateway.
 * It records the centre's stated policy so statements, the fee schedule
 * families are shown, and the overdue-fee workflow all quote the same
 * numbers instead of three different ones.
 */
export const paymentTermsSchema = z.object({
  cycle: z.enum(["weekly", "fortnightly", "monthly"]).default("fortnightly"),
  /**
   * Which day the direct debit runs. 1 = Monday. Null means the centre
   * hasn't set one and statements should say so rather than guess.
   */
  debitDay: z.number().int().min(1).max(7).nullable().default(null),
  /** Days after invoice before an account is considered overdue. */
  paymentTermsDays: z.number().int().min(0).max(90).default(14),
  /** Charged once an account passes `paymentTermsDays`. */
  latePaymentFeeCents: centsField.optional(),
  /**
   * Statements are issued in advance rather than arrears. Changes what
   * "overdue" means, so it's recorded rather than assumed.
   */
  billInAdvance: z.boolean().default(true),
  /**
   * Whether the quoted fees INCLUDE GST. OSHC is generally GST-free, so
   * the default is false — but a centre selling incidentals needs the
   * flag to exist.
   */
  feesIncludeGst: z.boolean().default(false),
});

export const feePolicySchema = z.object({
  lateCollection: lateCollectionFeeSchema.partial().optional(),
  absence: absenceChargingSchema.partial().optional(),
  cancellation: cancellationFeeSchema.partial().optional(),
  onboarding: onboardingFeesSchema.partial().optional(),
  payment: paymentTermsSchema.partial().optional(),
  /**
   * Free text shown to families under the fee schedule — the caveats no
   * schema should try to model ("fees reviewed each January", "sibling
   * discount applied at enrolment").
   */
  notes: z.string().trim().max(2000).optional(),
});

export type FeePolicy = z.infer<typeof feePolicySchema>;

/**
 * Every default spelled out, so reading a policy never means remembering
 * which way an absent value falls.
 *
 * Note what this describes: a centre that charges nothing extra, bills
 * fortnightly in advance on 14-day terms, and charges the full fee for
 * absences either way. That is the behaviour every Amana centre has
 * today, which is the point — resolving an empty blob has to be a no-op.
 */
export const FEE_POLICY_DEFAULTS = {
  lateCollection: {
    enabled: false,
    basis: "per_block" as const,
    amountCents: 0,
    blockMinutes: 15,
    graceMinutes: 0,
    maxPerOccurrenceCents: undefined,
  },
  absence: {
    notified: "full" as const,
    notifiedPercent: 100,
    unnotified: "full" as const,
    unnotifiedPercent: 100,
    notifyHours: 12,
    noShowFeeCents: undefined,
  },
  cancellation: {
    enabled: false,
    withinHours: 24,
    basis: "percent_of_fee" as const,
    amountCents: 0,
    percentOfFee: 100,
  },
  onboarding: {
    enrolmentFeeCents: undefined,
    enrolmentFeePerChild: false,
    bondCents: undefined,
    bondRefundable: true,
    annualAdminFeeCents: undefined,
  },
  payment: {
    cycle: "fortnightly" as const,
    debitDay: null,
    paymentTermsDays: 14,
    latePaymentFeeCents: undefined,
    billInAdvance: true,
    feesIncludeGst: false,
  },
  notes: undefined,
} as const;

/**
 * A policy with every key present.
 *
 * Written out rather than derived with `Required<>`, because the money
 * fields are a different kind of optional from the rest: `blockMinutes`
 * always has a value, whereas `bondCents` being undefined IS the value —
 * it means "this centre charges no bond". `Required<>` strips exactly
 * that `undefined` and would force callers to invent a zero, which reads
 * on screen as "$0.00 bond" rather than "no bond".
 */
export interface ResolvedFeePolicy {
  lateCollection: {
    enabled: boolean;
    basis: "flat" | "per_minute" | "per_block";
    amountCents: number;
    blockMinutes: number;
    graceMinutes: number;
    maxPerOccurrenceCents: number | undefined;
  };
  absence: {
    notified: "full" | "none" | "percent";
    notifiedPercent: number;
    unnotified: "full" | "none" | "percent";
    unnotifiedPercent: number;
    notifyHours: number;
    noShowFeeCents: number | undefined;
  };
  cancellation: {
    enabled: boolean;
    withinHours: number;
    basis: "flat" | "percent_of_fee";
    amountCents: number;
    percentOfFee: number;
  };
  onboarding: {
    enrolmentFeeCents: number | undefined;
    enrolmentFeePerChild: boolean;
    bondCents: number | undefined;
    bondRefundable: boolean;
    annualAdminFeeCents: number | undefined;
  };
  payment: {
    cycle: "weekly" | "fortnightly" | "monthly";
    debitDay: number | null;
    paymentTermsDays: number;
    latePaymentFeeCents: number | undefined;
    billInAdvance: boolean;
    feesIncludeGst: boolean;
  };
  notes: string | undefined;
}

/**
 * Parse whatever is on the Service row into a fully-resolved policy.
 *
 * Invalid stored JSON resolves to defaults rather than throwing. A
 * settings blob that fails validation must not be able to take a
 * service detail page down — and since every default is "charge
 * nothing", falling back is the safe direction.
 */
export function resolveFeePolicy(raw: unknown): ResolvedFeePolicy {
  const parsed = feePolicySchema.safeParse(raw ?? {});
  const v: FeePolicy = parsed.success ? parsed.data : {};

  return {
    lateCollection: {
      ...FEE_POLICY_DEFAULTS.lateCollection,
      ...v.lateCollection,
    },
    absence: { ...FEE_POLICY_DEFAULTS.absence, ...v.absence },
    cancellation: {
      ...FEE_POLICY_DEFAULTS.cancellation,
      ...v.cancellation,
    },
    onboarding: { ...FEE_POLICY_DEFAULTS.onboarding, ...v.onboarding },
    payment: { ...FEE_POLICY_DEFAULTS.payment, ...v.payment },
    notes: v.notes,
  };
}

/**
 * What a late collection costs, in cents, for a pickup `minutesLate`
 * after the room closed.
 *
 * Returns 0 whenever charging is off, the minutes are inside the grace
 * period, or the policy is misconfigured — never a negative number and
 * never NaN. The sign-out screen calls this to show the charge as it
 * happens, so it has to be safe on partial input.
 *
 * `per_block` counts blocks STARTED, not completed: "$15 per 15 minutes
 * or part thereof" means one minute past the grace period costs $15.
 * That is deliberately the harsher reading, because it is the one every
 * published OSHC fee schedule uses.
 */
export function calculateLateFeeCents(
  policy: Pick<
    z.infer<typeof lateCollectionFeeSchema>,
    | "enabled"
    | "basis"
    | "amountCents"
    | "blockMinutes"
    | "graceMinutes"
    | "maxPerOccurrenceCents"
  >,
  minutesLate: number,
): number {
  if (!policy.enabled) return 0;
  if (!Number.isFinite(minutesLate)) return 0;

  const chargeable = Math.floor(minutesLate) - (policy.graceMinutes ?? 0);
  if (chargeable <= 0) return 0;

  const rate = policy.amountCents ?? 0;
  let total: number;

  switch (policy.basis) {
    case "flat":
      total = rate;
      break;
    case "per_minute":
      total = rate * chargeable;
      break;
    case "per_block": {
      // Guard the divisor: a stored 0 would produce Infinity, and this
      // number ends up on an invoice.
      const block = policy.blockMinutes && policy.blockMinutes > 0 ? policy.blockMinutes : 15;
      total = rate * Math.ceil(chargeable / block);
      break;
    }
    default:
      return 0;
  }

  const cap = policy.maxPerOccurrenceCents;
  if (cap !== undefined && cap > 0) total = Math.min(total, cap);

  return Math.max(0, Math.round(total));
}

/**
 * What an absence costs, in cents, given the session fee.
 *
 * `notified` is the caller's determination, not ours — whether enough
 * notice was given depends on the booking's start time, which this
 * module has no business knowing.
 */
export function calculateAbsenceChargeCents(
  policy: Pick<
    z.infer<typeof absenceChargingSchema>,
    "notified" | "notifiedPercent" | "unnotified" | "unnotifiedPercent" | "noShowFeeCents"
  >,
  sessionFeeCents: number,
  wasNotified: boolean,
): number {
  if (!Number.isFinite(sessionFeeCents) || sessionFeeCents < 0) return 0;

  const mode = wasNotified ? policy.notified : policy.unnotified;
  const percent = wasNotified ? policy.notifiedPercent : policy.unnotifiedPercent;

  let total: number;
  switch (mode) {
    case "none":
      total = 0;
      break;
    case "percent":
      total = Math.round((sessionFeeCents * (percent ?? 0)) / 100);
      break;
    case "full":
    default:
      total = sessionFeeCents;
      break;
  }

  // The no-show fee is additional, and only ever applies when the family
  // didn't tell us.
  if (!wasNotified && policy.noShowFeeCents) total += policy.noShowFeeCents;

  return Math.max(0, total);
}

/**
 * What cancelling a casual booking costs, in cents.
 *
 * `hoursNotice` outside the policy window is free — that's the whole
 * point of the window.
 */
export function calculateCancellationFeeCents(
  policy: Pick<
    z.infer<typeof cancellationFeeSchema>,
    "enabled" | "withinHours" | "basis" | "amountCents" | "percentOfFee"
  >,
  sessionFeeCents: number,
  hoursNotice: number,
): number {
  if (!policy.enabled) return 0;
  if (!Number.isFinite(hoursNotice) || !Number.isFinite(sessionFeeCents)) return 0;
  if (hoursNotice >= (policy.withinHours ?? 0)) return 0;

  const total =
    policy.basis === "flat"
      ? (policy.amountCents ?? 0)
      : Math.round((sessionFeeCents * (policy.percentOfFee ?? 0)) / 100);

  return Math.max(0, total);
}
