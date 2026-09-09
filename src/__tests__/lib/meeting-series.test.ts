import { describe, it, expect } from "vitest";
import {
  nextOccurrence,
  sameLocalDayRange,
} from "@/lib/meeting-series";

// Tuesday 13:30 Sydney. AEST (UTC+10) until 2026-10-04 02:00, then AEDT
// (UTC+11) — the DST boundary is the whole point of these pins.
const TUE_1330 = { dayOfWeek: 2, minuteOfDay: 13 * 60 + 30, timezone: "Australia/Sydney" };

describe("nextOccurrence", () => {
  it("AEST: Tuesday 13:30 Sydney = 03:30Z", () => {
    // From Monday 2026-09-07 00:00Z → next Tuesday is 2026-09-08
    const occ = nextOccurrence(TUE_1330, new Date("2026-09-07T00:00:00Z"));
    expect(occ.toISOString()).toBe("2026-09-08T03:30:00.000Z");
  });

  it("AEDT (after 2026-10-04 transition): Tuesday 13:30 Sydney = 02:30Z", () => {
    const occ = nextOccurrence(TUE_1330, new Date("2026-10-05T00:00:00Z"));
    expect(occ.toISOString()).toBe("2026-10-06T02:30:00.000Z");
  });

  it("rolls a week when `from` is later the same local day", () => {
    // 2026-09-08 05:00Z = Tue 15:00 Sydney — 13:30 already passed
    const occ = nextOccurrence(TUE_1330, new Date("2026-09-08T05:00:00Z"));
    expect(occ.toISOString()).toBe("2026-09-15T03:30:00.000Z");
  });

  it("returns the same day when `from` is earlier that local day", () => {
    // 2026-09-08 01:00Z = Tue 11:00 Sydney — 13:30 still ahead
    const occ = nextOccurrence(TUE_1330, new Date("2026-09-08T01:00:00Z"));
    expect(occ.toISOString()).toBe("2026-09-08T03:30:00.000Z");
  });

  it("crosses the DST-start week correctly", () => {
    // From Fri 2026-10-02: next Tuesday (Oct 6) is AFTER the Oct 4
    // spring-forward, so the wall clock pins to the AEDT offset.
    const occ = nextOccurrence(TUE_1330, new Date("2026-10-02T00:00:00Z"));
    expect(occ.toISOString()).toBe("2026-10-06T02:30:00.000Z");
  });

  it("handles a Sunday series (dayOfWeek 0)", () => {
    const occ = nextOccurrence(
      { dayOfWeek: 0, minuteOfDay: 9 * 60, timezone: "Australia/Sydney" },
      new Date("2026-09-09T00:00:00Z"), // Wednesday
    );
    // Sunday 2026-09-13 09:00 AEST = 2026-09-12 23:00Z
    expect(occ.toISOString()).toBe("2026-09-12T23:00:00.000Z");
  });
});

describe("sameLocalDayRange", () => {
  it("spans exactly Sydney midnight→midnight in UTC (AEST)", () => {
    const { start, end } = sameLocalDayRange(
      new Date("2026-09-08T03:30:00Z"),
      "Australia/Sydney",
    );
    expect(start.toISOString()).toBe("2026-09-07T14:00:00.000Z"); // Tue 00:00 AEST
    expect(end.toISOString()).toBe("2026-09-08T14:00:00.000Z"); // Wed 00:00 AEST
  });

  it("spans Sydney midnight→midnight in UTC (AEDT)", () => {
    const { start, end } = sameLocalDayRange(
      new Date("2026-10-06T02:30:00Z"),
      "Australia/Sydney",
    );
    expect(start.toISOString()).toBe("2026-10-05T13:00:00.000Z"); // Tue 00:00 AEDT
    expect(end.toISOString()).toBe("2026-10-06T13:00:00.000Z");
  });
});
