import { describe, it, expect } from "vitest";
import {
  anchorDayLabel,
  anchorDayRange,
  anchorDayValid,
  describeBilling,
  formatCents,
  isBillingFrequency,
  parseDollarsToCents,
} from "@/lib/family-billing";

describe("isBillingFrequency", () => {
  it("accepts the three real cycles", () => {
    expect(isBillingFrequency("weekly")).toBe(true);
    expect(isBillingFrequency("fortnightly")).toBe(true);
    expect(isBillingFrequency("monthly")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isBillingFrequency("daily")).toBe(false);
    expect(isBillingFrequency("")).toBe(false);
    expect(isBillingFrequency(null)).toBe(false);
  });
});

describe("anchor day", () => {
  it("caps monthly at 28 so February always has the date", () => {
    expect(anchorDayRange("monthly")).toEqual({ min: 1, max: 28 });
    expect(anchorDayValid("monthly", 28)).toBe(true);
    expect(anchorDayValid("monthly", 29)).toBe(false);
    expect(anchorDayValid("monthly", 31)).toBe(false);
  });

  it("uses weekdays for weekly and fortnightly", () => {
    expect(anchorDayRange("weekly")).toEqual({ min: 1, max: 7 });
    expect(anchorDayValid("weekly", 7)).toBe(true);
    expect(anchorDayValid("weekly", 8)).toBe(false);
    expect(anchorDayValid("fortnightly", 3)).toBe(true);
  });

  it("treats an unset day as valid — it just isn't configured yet", () => {
    expect(anchorDayValid("monthly", null)).toBe(true);
    expect(anchorDayValid("weekly", undefined)).toBe(true);
  });

  it("rejects a non-integer day", () => {
    expect(anchorDayValid("weekly", 2.5)).toBe(false);
    expect(anchorDayValid("monthly", 0)).toBe(false);
  });

  it("labels the day according to the cycle", () => {
    expect(anchorDayLabel("weekly", 1)).toBe("Monday");
    expect(anchorDayLabel("fortnightly", 5)).toBe("Friday");
    expect(anchorDayLabel("monthly", 15)).toBe("Day 15 of the month");
    expect(anchorDayLabel("weekly", null)).toBeNull();
  });
});

describe("parseDollarsToCents", () => {
  it("reads plain and formatted amounts", () => {
    expect(parseDollarsToCents("250")).toBe(25000);
    expect(parseDollarsToCents("250.50")).toBe(25050);
    expect(parseDollarsToCents("$1,200.00")).toBe(120000);
    expect(parseDollarsToCents(" 99.9 ")).toBe(9990);
  });

  it("treats empty as 'no limit', which is a real setting", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("   ")).toBeNull();
    expect(parseDollarsToCents(null)).toBeNull();
  });

  it("returns undefined for junk — NOT null", () => {
    // The distinction matters: null removes the cap on purpose, undefined
    // means we couldn't read it. Collapsing them would let a typo silently
    // delete a limit staff set deliberately.
    expect(parseDollarsToCents("abc")).toBeUndefined();
    expect(parseDollarsToCents("12.345")).toBeUndefined();
    expect(parseDollarsToCents("-50")).toBeUndefined();
  });

  it("rounds to whole cents rather than carrying a float", () => {
    expect(parseDollarsToCents("0.1")).toBe(10);
    expect(parseDollarsToCents("19.99")).toBe(1999);
  });
});

describe("formatCents", () => {
  it("renders whole and part dollars", () => {
    expect(formatCents(25000)).toBe("$250.00");
    expect(formatCents(1999)).toBe("$19.99");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("returns null when there's no cap", () => {
    expect(formatCents(null)).toBeNull();
    expect(formatCents(undefined)).toBeNull();
  });
});

describe("describeBilling", () => {
  it("says so plainly when nothing is set", () => {
    expect(describeBilling({})).toBe("No billing arrangement set");
  });

  it("describes a weekly cycle with a cap", () => {
    expect(
      describeBilling({
        billingFrequency: "fortnightly",
        billingAnchorDay: 3,
        billingLimitCents: 25000,
      }),
    ).toBe("Fortnightly on Wednesday, capped at $250.00");
  });

  it("describes a monthly cycle", () => {
    expect(
      describeBilling({ billingFrequency: "monthly", billingAnchorDay: 15 }),
    ).toBe("Monthly, day 15 of the month");
  });

  it("omits parts that aren't configured", () => {
    expect(describeBilling({ billingFrequency: "weekly" })).toBe("Weekly");
  });
});
