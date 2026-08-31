import { describe, it, expect } from "vitest";
import {
  ageDebts,
  bucketFor,
  daysOverdue,
  formatMoney,
  fromCents,
  sumDollars,
  toCents,
} from "@/lib/money";

describe("toCents / fromCents", () => {
  it("converts exactly", () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(0.1)).toBe(10);
    expect(toCents(1000)).toBe(100000);
    expect(fromCents(1234)).toBe(12.34);
  });

  it("rounds float noise to the intended cent", () => {
    // What a Float column hands back after arithmetic upstream.
    expect(toCents(0.30000000000000004)).toBe(30);
    expect(toCents(1234.5600000000002)).toBe(123456);
  });

  it("rounds half AWAY FROM ZERO, symmetrically", () => {
    // Math.round breaks ties toward +infinity, so a charge and a credit
    // of the same size would round differently and leave a phantom cent
    // in reconciliation.
    expect(toCents(12.345)).toBe(1235);
    expect(toCents(-12.345)).toBe(-1235);
    expect(toCents(0.005)).toBe(1);
    expect(toCents(-0.005)).toBe(-1);
  });

  it("treats null, undefined and NaN as zero rather than throwing", () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents(NaN)).toBe(0);
  });

  it("handles negatives (credits)", () => {
    expect(toCents(-45.5)).toBe(-4550);
  });
});

describe("sumDollars", () => {
  it("sums without float drift — the whole point", () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in cents it's exact.
    expect(sumDollars([0.1, 0.2])).toBe(30);
    expect(fromCents(sumDollars([0.1, 0.2]))).toBe(0.3);
  });

  it("stays exact over many lines", () => {
    const lines = Array.from({ length: 300 }, () => 19.99);
    expect(sumDollars(lines)).toBe(300 * 1999);
  });

  it("ignores nulls in the list", () => {
    expect(sumDollars([10, null, 5, undefined])).toBe(1500);
  });
});

describe("formatMoney", () => {
  it("always shows two decimals", () => {
    expect(formatMoney(1234)).toBe("$12.34");
    expect(formatMoney(1200)).toBe("$12.00");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("groups thousands", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(100000000)).toBe("$1,000,000.00");
  });

  it("puts the sign before the dollar symbol", () => {
    expect(formatMoney(-4550)).toBe("-$45.50");
  });
});

describe("daysOverdue", () => {
  const asOf = new Date("2026-07-31T10:00:00.000Z");

  it("is zero on the due date, regardless of time of day", () => {
    // The bug this guards: a millisecond diff would make a same-day
    // invoice look 0.4 days overdue and land it in the 1-30 bucket.
    expect(daysOverdue("2026-07-31", asOf)).toBe(0);
    expect(daysOverdue(new Date("2026-07-31T23:59:00.000Z"), asOf)).toBe(0);
  });

  it("counts whole days past due", () => {
    expect(daysOverdue("2026-07-30", asOf)).toBe(1);
    expect(daysOverdue("2026-07-01", asOf)).toBe(30);
    expect(daysOverdue("2026-05-02", asOf)).toBe(90);
  });

  it("is negative for a future due date", () => {
    expect(daysOverdue("2026-08-10", asOf)).toBe(-10);
  });

  it("treats a missing or unparseable date as not overdue", () => {
    expect(daysOverdue(null, asOf)).toBe(0);
    expect(daysOverdue("not a date", asOf)).toBe(0);
  });
});

describe("bucketFor", () => {
  it("puts not-yet-due and due-today in current", () => {
    expect(bucketFor(-5)).toBe("current");
    expect(bucketFor(0)).toBe("current");
  });

  it("uses inclusive boundaries", () => {
    expect(bucketFor(1)).toBe("d1_30");
    expect(bucketFor(30)).toBe("d1_30");
    expect(bucketFor(31)).toBe("d31_60");
    expect(bucketFor(60)).toBe("d31_60");
    expect(bucketFor(61)).toBe("d61_90");
    expect(bucketFor(90)).toBe("d61_90");
    expect(bucketFor(91)).toBe("d90_plus");
    expect(bucketFor(9999)).toBe("d90_plus");
  });
});

describe("ageDebts", () => {
  const asOf = new Date("2026-07-31T00:00:00.000Z");

  it("buckets by age and totals in cents", () => {
    const out = ageDebts(
      [
        { dueDate: "2026-08-05", balance: 100 }, // future → current
        { dueDate: "2026-07-20", balance: 50 }, // 11 days
        { dueDate: "2026-06-20", balance: 25 }, // 41 days
        { dueDate: "2026-03-01", balance: 10 }, // 152 days
      ],
      asOf,
    );
    expect(out.current).toBe(10000);
    expect(out.d1_30).toBe(5000);
    expect(out.d31_60).toBe(2500);
    expect(out.d90_plus).toBe(1000);
    expect(out.total).toBe(18500);
  });

  it("excludes settled and credit balances", () => {
    const out = ageDebts(
      [
        { dueDate: "2026-07-01", balance: 0 },
        { dueDate: "2026-07-01", balance: -50 },
        { dueDate: "2026-07-01", balance: 30 },
      ],
      asOf,
    );
    expect(out.total).toBe(3000);
  });

  it("counts a debt with NO due date as current rather than dropping it", () => {
    // Dropping it would understate what a family owes — the one error an
    // aged-debtors report must never make.
    const out = ageDebts([{ dueDate: null, balance: 75 }], asOf);
    expect(out.current).toBe(7500);
    expect(out.total).toBe(7500);
  });

  it("returns all-zero for an empty list", () => {
    const out = ageDebts([], asOf);
    expect(out.total).toBe(0);
    expect(out.d90_plus).toBe(0);
  });

  it("stays exact across many small debts", () => {
    const debts = Array.from({ length: 100 }, () => ({
      dueDate: "2026-07-01",
      balance: 0.07,
    }));
    expect(ageDebts(debts, asOf).total).toBe(700);
  });
});
