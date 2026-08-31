import { describe, it, expect } from "vitest";
import {
  getCurrentTerm,
  getNextTerm,
  getTermsForYear,
  hasExactTermDates,
} from "@/lib/school-terms";

describe("hasExactTermDates", () => {
  it("is true for years in the table (2026, 2027, 2028, 2029)", () => {
    expect(hasExactTermDates(2026)).toBe(true);
    expect(hasExactTermDates(2027)).toBe(true);
    expect(hasExactTermDates(2028)).toBe(true);
    expect(hasExactTermDates(2029)).toBe(true);
  });

  it("is false for years outside the table", () => {
    expect(hasExactTermDates(2025)).toBe(false);
    expect(hasExactTermDates(2030)).toBe(false);
  });
});

describe("TERM_TABLE 2028/2029 (NSW DoE future-dates)", () => {
  it("2028: matches the official term start/end dates", () => {
    const terms = getTermsForYear(2028);
    expect(terms).toHaveLength(4);
    expect(terms[0]).toMatchObject({
      year: 2028,
      term: 1,
      startsOn: new Date("2028-01-31T00:00:00"),
      endsOn: new Date("2028-04-07T23:59:59.999"),
    });
    expect(terms[1]).toMatchObject({
      year: 2028,
      term: 2,
      startsOn: new Date("2028-04-24T00:00:00"),
      endsOn: new Date("2028-07-07T23:59:59.999"),
    });
    expect(terms[2]).toMatchObject({
      year: 2028,
      term: 3,
      startsOn: new Date("2028-07-24T00:00:00"),
      endsOn: new Date("2028-09-29T23:59:59.999"),
    });
    expect(terms[3]).toMatchObject({
      year: 2028,
      term: 4,
      startsOn: new Date("2028-10-16T00:00:00"),
      endsOn: new Date("2028-12-21T23:59:59.999"),
    });
  });

  it("2029: matches the official term start/end dates", () => {
    const terms = getTermsForYear(2029);
    expect(terms).toHaveLength(4);
    expect(terms[0]).toMatchObject({
      year: 2029,
      term: 1,
      startsOn: new Date("2029-01-29T00:00:00"),
      endsOn: new Date("2029-04-13T23:59:59.999"),
    });
    expect(terms[1]).toMatchObject({
      year: 2029,
      term: 2,
      startsOn: new Date("2029-04-30T00:00:00"),
      endsOn: new Date("2029-07-06T23:59:59.999"),
    });
    expect(terms[2]).toMatchObject({
      year: 2029,
      term: 3,
      startsOn: new Date("2029-07-23T00:00:00"),
      endsOn: new Date("2029-09-28T23:59:59.999"),
    });
    expect(terms[3]).toMatchObject({
      year: 2029,
      term: 4,
      startsOn: new Date("2029-10-15T00:00:00"),
      endsOn: new Date("2029-12-20T23:59:59.999"),
    });
  });
});

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
