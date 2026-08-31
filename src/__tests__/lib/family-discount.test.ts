/**
 * Family discounts.
 *
 * These decide what someone is charged, so the tests pin the ways a
 * discount could quietly cost the centre money or overcharge a family:
 * two discounts stacking, one applying after it expired, a percentage
 * over 100, and a discount taking a fee below zero.
 */
import { describe, it, expect } from "vitest";
import {
  activeDiscounts,
  applyFamilyDiscount,
  discountAmountCents,
  type DiscountRule,
} from "@/lib/family-discount";

const rule = (over: Partial<DiscountRule> = {}): DiscountRule => ({
  id: "d1",
  sessionType: null,
  kind: "percent",
  value: 10,
  reason: "Sibling",
  startDate: new Date("2026-01-01"),
  endDate: null,
  ...over,
});

const ON = new Date("2026-06-15");

describe("activeDiscounts", () => {
  it("excludes one that hasn't started", () => {
    const r = rule({ startDate: new Date("2026-07-01") });
    expect(activeDiscounts([r], "asc", ON)).toHaveLength(0);
  });

  it("includes one ending TODAY — the last day counts", () => {
    // A family told "until 30 June" expects the 30th to be discounted.
    const r = rule({ endDate: new Date("2026-06-15") });
    expect(activeDiscounts([r], "asc", ON)).toHaveLength(1);
  });

  it("excludes one that ended yesterday", () => {
    const r = rule({ endDate: new Date("2026-06-14") });
    expect(activeDiscounts([r], "asc", ON)).toHaveLength(0);
  });

  it("excludes a discount scoped to a different room", () => {
    expect(activeDiscounts([rule({ sessionType: "bsc" })], "asc", ON)).toHaveLength(
      0,
    );
  });

  it("puts the room-specific one first", () => {
    const all = rule({ id: "all", sessionType: null });
    const room = rule({ id: "room", sessionType: "asc" });
    expect(activeDiscounts([all, room], "asc", ON)[0].id).toBe("room");
  });
});

describe("discountAmountCents", () => {
  it("takes a percentage", () => {
    expect(discountAmountCents(rule({ value: 25 }), 4000)).toBe(1000);
  });

  it("takes a flat amount in cents", () => {
    expect(discountAmountCents(rule({ kind: "amount", value: 500 }), 4000)).toBe(
      500,
    );
  });

  it("clamps a percentage over 100", () => {
    expect(discountAmountCents(rule({ value: 150 }), 4000)).toBe(4000);
  });

  it("never takes more than the fee", () => {
    // Otherwise the "price" goes negative and becomes a credit by
    // accident — which belongs in billing, not here.
    expect(discountAmountCents(rule({ kind: "amount", value: 99999 }), 4000)).toBe(
      4000,
    );
  });

  it("ignores a negative value", () => {
    expect(discountAmountCents(rule({ kind: "amount", value: -500 }), 4000)).toBe(
      0,
    );
  });
});

describe("applyFamilyDiscount", () => {
  it("returns the fee untouched when nothing applies", () => {
    const out = applyFamilyDiscount(4168, [], "asc", ON);
    expect(out.amountCents).toBe(4168);
    expect(out.discountCents).toBe(0);
    expect(out.applied).toBeNull();
  });

  it("applies ONE discount, never the sum of two", () => {
    // 20% sibling + 50% staff must not become 70%.
    const out = applyFamilyDiscount(
      10000,
      [
        rule({ id: "sib", value: 20, reason: "Sibling" }),
        rule({ id: "staff", value: 50, reason: "Staff" }),
      ],
      "asc",
      ON,
    );
    expect(out.discountCents).toBe(5000);
    expect(out.applied?.reason).toBe("Staff");
  });

  it("prefers the room-specific one even when it's smaller", () => {
    // It was written for this case; the broad one wasn't.
    const out = applyFamilyDiscount(
      10000,
      [
        rule({ id: "all", value: 50, sessionType: null, reason: "Hardship" }),
        rule({ id: "room", value: 10, sessionType: "asc", reason: "Staff ASC" }),
      ],
      "asc",
      ON,
    );
    expect(out.applied?.reason).toBe("Staff ASC");
    expect(out.amountCents).toBe(9000);
  });

  it("names what was applied, for the invoice", () => {
    const out = applyFamilyDiscount(4000, [rule({ reason: "Sibling" })], "asc", ON);
    expect(out.applied?.reason).toBe("Sibling");
    expect(out.amountCents).toBe(3600);
  });

  it("can take a fee to zero but never below", () => {
    const out = applyFamilyDiscount(
      4000,
      [rule({ kind: "amount", value: 999999 })],
      "asc",
      ON,
    );
    expect(out.amountCents).toBe(0);
    expect(out.discountCents).toBe(4000);
  });

  it("leaves a zero fee alone", () => {
    const out = applyFamilyDiscount(0, [rule({ value: 50 })], "asc", ON);
    expect(out.amountCents).toBe(0);
    expect(out.applied).toBeNull();
  });
});
