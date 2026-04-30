import { describe, it, expect } from "vitest";
import { getTermForDate } from "@/lib/school-terms";

describe("getTermForDate", () => {
  it("returns the matching term for a date inside Term 2 2026", () => {
    const r = getTermForDate(new Date("2026-05-15T09:00:00"));
    expect(r).toEqual({ year: 2026, number: 2 });
  });

  it("returns null for a school-holiday date", () => {
    const r = getTermForDate(new Date("2026-04-15T09:00:00"));
    expect(r).toBeNull();
  });

  it("returns the term containing the term-start day", () => {
    const r = getTermForDate(new Date("2026-04-28T00:00:00"));
    expect(r).toEqual({ year: 2026, number: 2 });
  });

  it("crosses year boundaries — early Jan", () => {
    const r = getTermForDate(new Date("2026-01-15T09:00:00"));
    expect(r).toBeNull(); // before T1 2026 starts
  });
});
