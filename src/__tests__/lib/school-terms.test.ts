import { describe, it, expect } from "vitest";
import { getCurrentTerm, getNextTerm, getTermsForYear } from "@/lib/school-terms";

describe("getTermsForYear", () => {
  it("returns 4 terms for a known year (2026)", () => {
    const terms = getTermsForYear(2026);
    expect(terms).toHaveLength(4);
    expect(terms[0].term).toBe(1);
    expect(terms[3].term).toBe(4);
    expect(terms[0].year).toBe(2026);
  });

  it("returns approximated terms for unknown year", () => {
    const terms = getTermsForYear(2099);
    expect(terms).toHaveLength(4);
    expect(terms[0].year).toBe(2099);
  });
});

describe("getCurrentTerm", () => {
  it("returns the term enclosing the date (mid-term 1)", () => {
    const d = new Date("2026-02-15T10:00:00");
    const term = getCurrentTerm(d);
    expect(term.term).toBe(1);
    expect(term.year).toBe(2026);
  });

  it("returns the upcoming term when date is in holidays", () => {
    // Between Term 1 end (Apr 10) and Term 2 start (Apr 28)
    const d = new Date("2026-04-20T12:00:00");
    const term = getCurrentTerm(d);
    expect(term.term).toBe(2);
  });

  it("rolls to next year's Term 1 when past Term 4 end", () => {
    const d = new Date("2026-12-25T12:00:00");
    const term = getCurrentTerm(d);
    expect(term.term).toBe(1);
    expect(term.year).toBe(2027);
  });
});

describe("getNextTerm", () => {
  it("returns Term 2 when current is Term 1", () => {
    const next = getNextTerm(new Date("2026-02-15T10:00:00"));
    expect(next.term).toBe(2);
    expect(next.year).toBe(2026);
  });

  it("returns next year's Term 1 when current is Term 4", () => {
    const next = getNextTerm(new Date("2026-11-15T10:00:00"));
    expect(next.term).toBe(1);
    expect(next.year).toBe(2027);
  });
});
