import { describe, it, expect } from "vitest";
import { isNewsletterChaseWeek, getCurrentTerm } from "@/lib/school-terms";

describe("isNewsletterChaseWeek", () => {
  it("returns ineligible during school holidays", () => {
    // Between Term 1 (ends 2026-04-10) and Term 2 (starts 2026-04-28) — holiday window
    const result = isNewsletterChaseWeek(new Date("2026-04-15T10:00:00"));
    expect(result.eligible).toBe(false);
    expect(result.currentTerm).toBeNull();
  });

  it("flags eligible in the final week of a term (≤7 days remaining)", () => {
    // Term 2 ends 2026-07-03. Six days before = 2026-06-27 (Sat).
    const result = isNewsletterChaseWeek(new Date("2026-06-29T09:00:00"));
    expect(result.eligible).toBe(true);
    expect(result.currentTerm).toEqual({ year: 2026, number: 2 });
    expect(result.nextTerm).toEqual({ year: 2026, number: 3 });
    expect(result.weeksUntilTermEnd).toBe(1);
  });

  it("flags eligible two weeks out from term end", () => {
    // Term 2 ends 2026-07-03. ~13 days before = 2026-06-20 (Sat).
    const result = isNewsletterChaseWeek(new Date("2026-06-22T09:00:00"));
    expect(result.eligible).toBe(true);
    expect(result.weeksUntilTermEnd).toBe(2);
  });

  it("returns ineligible mid-term (3+ weeks remaining)", () => {
    // Term 2 starts 2026-04-28. Two weeks in = 2026-05-12.
    const result = isNewsletterChaseWeek(new Date("2026-05-12T09:00:00"));
    expect(result.eligible).toBe(false);
    expect(result.weeksUntilTermEnd).toBeGreaterThanOrEqual(3);
  });

  it("returns ineligible early in the term", () => {
    const result = isNewsletterChaseWeek(new Date("2026-04-30T09:00:00"));
    expect(result.eligible).toBe(false);
    expect(result.currentTerm).toEqual({ year: 2026, number: 2 });
  });
});

describe("getCurrentTerm regression check", () => {
  it("still returns Term 2 for late-April 2026", () => {
    const t = getCurrentTerm(new Date("2026-04-30T09:00:00"));
    expect(t.year).toBe(2026);
    expect(t.term).toBe(2);
  });
});
