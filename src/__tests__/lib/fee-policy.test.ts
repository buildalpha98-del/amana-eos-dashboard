import { describe, it, expect } from "vitest";
import {
  feePolicySchema,
  resolveFeePolicy,
  calculateLateFeeCents,
  calculateAbsenceChargeCents,
  calculateCancellationFeeCents,
  FEE_POLICY_DEFAULTS,
} from "@/lib/fee-policy";

// ---------------------------------------------------------------------------
// resolveFeePolicy — the safety property the whole module rests on
// ---------------------------------------------------------------------------

describe("resolveFeePolicy", () => {
  it("resolves null/undefined to a policy that charges nothing", () => {
    for (const input of [null, undefined, {}]) {
      const p = resolveFeePolicy(input);
      expect(p.lateCollection.enabled).toBe(false);
      expect(p.cancellation.enabled).toBe(false);
      expect(p.onboarding.enrolmentFeeCents).toBeUndefined();
      expect(p.onboarding.bondCents).toBeUndefined();
      expect(p.payment.latePaymentFeeCents).toBeUndefined();
      expect(p.absence.noShowFeeCents).toBeUndefined();
    }
  });

  it("keeps absence charging at the full fee by default (CCS-claimable)", () => {
    const p = resolveFeePolicy(null);
    expect(p.absence.notified).toBe("full");
    expect(p.absence.unnotified).toBe("full");
  });

  it("falls back to defaults rather than throwing on corrupt stored JSON", () => {
    // A settings blob that fails validation must not be able to take a
    // service detail page down.
    const p = resolveFeePolicy({ lateCollection: { basis: "per_fortnight" } });
    expect(p.lateCollection.basis).toBe(
      FEE_POLICY_DEFAULTS.lateCollection.basis,
    );
    expect(p.lateCollection.enabled).toBe(false);
  });

  it("merges a partial group without dropping the untouched keys", () => {
    const p = resolveFeePolicy({
      lateCollection: { enabled: true, amountCents: 1500 },
    });
    expect(p.lateCollection.enabled).toBe(true);
    expect(p.lateCollection.amountCents).toBe(1500);
    // Untouched keys keep their defaults.
    expect(p.lateCollection.blockMinutes).toBe(15);
    expect(p.lateCollection.graceMinutes).toBe(0);
  });

  it("leaves the other groups at defaults when one group is set", () => {
    const p = resolveFeePolicy({ cancellation: { enabled: true } });
    expect(p.cancellation.enabled).toBe(true);
    expect(p.lateCollection.enabled).toBe(false);
    expect(p.payment.cycle).toBe("fortnightly");
  });
});

// ---------------------------------------------------------------------------
// feePolicySchema
// ---------------------------------------------------------------------------

describe("feePolicySchema", () => {
  it("accepts an empty object", () => {
    expect(feePolicySchema.safeParse({}).success).toBe(true);
  });

  it("rejects a negative amount", () => {
    const r = feePolicySchema.safeParse({
      lateCollection: { amountCents: -100 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer cents value", () => {
    const r = feePolicySchema.safeParse({
      lateCollection: { amountCents: 15.5 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an absurd amount above the $1,000 ceiling", () => {
    const r = feePolicySchema.safeParse({
      onboarding: { bondCents: 500_000 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a percentage above 100", () => {
    const r = feePolicySchema.safeParse({
      cancellation: { percentOfFee: 150 },
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculateLateFeeCents
// ---------------------------------------------------------------------------

describe("calculateLateFeeCents", () => {
  const base = {
    enabled: true,
    basis: "per_block" as const,
    amountCents: 1500,
    blockMinutes: 15,
    graceMinutes: 0,
    maxPerOccurrenceCents: undefined,
  };

  it("charges nothing when the policy is off", () => {
    expect(calculateLateFeeCents({ ...base, enabled: false }, 60)).toBe(0);
  });

  it("charges nothing when the pickup is on time or early", () => {
    expect(calculateLateFeeCents(base, 0)).toBe(0);
    expect(calculateLateFeeCents(base, -10)).toBe(0);
  });

  it("counts blocks STARTED — one minute over costs a full block", () => {
    // "$15 per 15 minutes or part thereof" is what every published OSHC
    // fee schedule means, so 1 minute late is $15, not $1.
    expect(calculateLateFeeCents(base, 1)).toBe(1500);
    expect(calculateLateFeeCents(base, 15)).toBe(1500);
    expect(calculateLateFeeCents(base, 16)).toBe(3000);
    expect(calculateLateFeeCents(base, 30)).toBe(3000);
  });

  it("applies the grace period before charging", () => {
    const p = { ...base, graceMinutes: 5 };
    expect(calculateLateFeeCents(p, 5)).toBe(0);
    expect(calculateLateFeeCents(p, 6)).toBe(1500);
    expect(calculateLateFeeCents(p, 20)).toBe(1500); // 15 chargeable
    expect(calculateLateFeeCents(p, 21)).toBe(3000); // 16 chargeable
  });

  it("charges per minute when that is the basis", () => {
    const p = { ...base, basis: "per_minute" as const, amountCents: 100 };
    expect(calculateLateFeeCents(p, 20)).toBe(2000);
  });

  it("charges once when the basis is flat, however late", () => {
    const p = { ...base, basis: "flat" as const, amountCents: 2500 };
    expect(calculateLateFeeCents(p, 5)).toBe(2500);
    expect(calculateLateFeeCents(p, 90)).toBe(2500);
  });

  it("respects the per-occurrence cap", () => {
    const p = {
      ...base,
      basis: "per_minute" as const,
      amountCents: 100,
      maxPerOccurrenceCents: 5000,
    };
    // 90 minutes × $1 would be $90; the cap holds it to $50.
    expect(calculateLateFeeCents(p, 90)).toBe(5000);
  });

  it("survives a stored blockMinutes of 0 rather than returning Infinity", () => {
    // This number ends up on an invoice — it must never be Infinity/NaN.
    const p = { ...base, blockMinutes: 0 };
    const result = calculateLateFeeCents(p, 20);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(3000); // falls back to 15-minute blocks
  });

  it("returns 0 for a non-finite minutesLate", () => {
    expect(calculateLateFeeCents(base, NaN)).toBe(0);
    expect(calculateLateFeeCents(base, Infinity)).toBe(0);
  });

  it("ignores partial minutes rather than charging for them twice", () => {
    expect(calculateLateFeeCents(base, 15.9)).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
// calculateAbsenceChargeCents
// ---------------------------------------------------------------------------

describe("calculateAbsenceChargeCents", () => {
  const full = {
    notified: "full" as const,
    notifiedPercent: 100,
    unnotified: "full" as const,
    unnotifiedPercent: 100,
    noShowFeeCents: undefined,
  };

  it("charges the full session fee by default, notified or not", () => {
    expect(calculateAbsenceChargeCents(full, 5000, true)).toBe(5000);
    expect(calculateAbsenceChargeCents(full, 5000, false)).toBe(5000);
  });

  it("charges nothing for a notified absence when the policy says so", () => {
    const p = { ...full, notified: "none" as const };
    expect(calculateAbsenceChargeCents(p, 5000, true)).toBe(0);
    // …but the unnotified rate is untouched.
    expect(calculateAbsenceChargeCents(p, 5000, false)).toBe(5000);
  });

  it("applies a percentage of the session fee", () => {
    const p = { ...full, notified: "percent" as const, notifiedPercent: 50 };
    expect(calculateAbsenceChargeCents(p, 5000, true)).toBe(2500);
  });

  it("rounds a percentage to whole cents", () => {
    const p = { ...full, notified: "percent" as const, notifiedPercent: 33 };
    expect(calculateAbsenceChargeCents(p, 999, true)).toBe(330);
  });

  it("adds the no-show fee only when the family did not notify", () => {
    const p = { ...full, noShowFeeCents: 1000 };
    expect(calculateAbsenceChargeCents(p, 5000, false)).toBe(6000);
    expect(calculateAbsenceChargeCents(p, 5000, true)).toBe(5000);
  });

  it("still charges the no-show fee when the session itself is free", () => {
    const p = { ...full, unnotified: "none" as const, noShowFeeCents: 1000 };
    expect(calculateAbsenceChargeCents(p, 5000, false)).toBe(1000);
  });

  it("returns 0 for a nonsense session fee", () => {
    expect(calculateAbsenceChargeCents(full, -100, true)).toBe(0);
    expect(calculateAbsenceChargeCents(full, NaN, true)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateCancellationFeeCents
// ---------------------------------------------------------------------------

describe("calculateCancellationFeeCents", () => {
  const base = {
    enabled: true,
    withinHours: 24,
    basis: "percent_of_fee" as const,
    amountCents: 0,
    percentOfFee: 100,
  };

  it("charges nothing when the policy is off", () => {
    expect(
      calculateCancellationFeeCents({ ...base, enabled: false }, 5000, 1),
    ).toBe(0);
  });

  it("charges nothing when cancelled outside the window", () => {
    expect(calculateCancellationFeeCents(base, 5000, 24)).toBe(0);
    expect(calculateCancellationFeeCents(base, 5000, 48)).toBe(0);
  });

  it("charges the full fee when cancelled inside the window", () => {
    expect(calculateCancellationFeeCents(base, 5000, 23)).toBe(5000);
    expect(calculateCancellationFeeCents(base, 5000, 0)).toBe(5000);
  });

  it("charges a percentage of the fee", () => {
    const p = { ...base, percentOfFee: 50 };
    expect(calculateCancellationFeeCents(p, 5000, 2)).toBe(2500);
  });

  it("charges a flat amount when that is the basis", () => {
    const p = { ...base, basis: "flat" as const, amountCents: 2000 };
    expect(calculateCancellationFeeCents(p, 5000, 2)).toBe(2000);
  });

  it("returns 0 for non-finite inputs", () => {
    expect(calculateCancellationFeeCents(base, NaN, 2)).toBe(0);
    expect(calculateCancellationFeeCents(base, 5000, NaN)).toBe(0);
  });
});
