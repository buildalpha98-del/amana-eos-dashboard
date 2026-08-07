import { describe, expect, it } from "vitest";
import {
  deriveFirstAttendance,
  meetsPaidSessionThreshold,
  paidSessionsInWindow,
  tierAmountFor,
  windowEnd,
} from "@/lib/ambassadors/qualification";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("deriveFirstAttendance", () => {
  it("returns null with no sessions", () => {
    expect(deriveFirstAttendance([])).toBeNull();
  });

  it("returns the earliest session date", () => {
    const first = deriveFirstAttendance([
      { date: d("2026-08-24"), fee: 25 },
      { date: d("2026-08-18"), fee: 25 },
      { date: d("2026-08-20"), fee: 25 },
    ]);
    expect(first?.toISOString()).toBe(d("2026-08-18").toISOString());
  });

  it("a $0 free first session IS first attendance (anchors the window)", () => {
    const first = deriveFirstAttendance([
      { date: d("2026-08-17"), fee: 0 },
      { date: d("2026-08-19"), fee: 25 },
    ]);
    expect(first?.toISOString()).toBe(d("2026-08-17").toISOString());
  });
});

describe("28-day window", () => {
  it("windowEnd is first attendance + 27 days (28 days inclusive)", () => {
    expect(windowEnd(d("2026-08-17")).toISOString()).toBe(
      d("2026-09-13").toISOString(),
    );
  });

  it("counts a paid session on day 27 but not day 28", () => {
    const first = d("2026-08-17");
    const day27 = d("2026-09-13"); // 27 days after
    const day28 = d("2026-09-14"); // 28 days after — outside
    expect(paidSessionsInWindow([{ date: day27, fee: 25 }], first)).toBe(1);
    expect(paidSessionsInWindow([{ date: day28, fee: 25 }], first)).toBe(0);
  });

  it("ignores paid sessions before first attendance", () => {
    const first = d("2026-08-17");
    expect(
      paidSessionsInWindow([{ date: d("2026-08-10"), fee: 25 }], first),
    ).toBe(0);
  });
});

describe("$0 session exclusion", () => {
  it("free sessions never count toward the paid threshold", () => {
    const first = d("2026-08-17");
    const sessions = [
      { date: d("2026-08-17"), fee: 0 }, // free first session
      { date: d("2026-08-19"), fee: 25 },
      { date: d("2026-08-21"), fee: 25 },
      { date: d("2026-08-24"), fee: 25 },
    ];
    expect(paidSessionsInWindow(sessions, first)).toBe(3);
    expect(meetsPaidSessionThreshold(sessions, first)).toBe(false);
  });

  it("meets the threshold at exactly 4 paid sessions in the window", () => {
    const first = d("2026-08-17");
    const sessions = [
      { date: d("2026-08-17"), fee: 0 },
      { date: d("2026-08-19"), fee: 25 },
      { date: d("2026-08-21"), fee: 25 },
      { date: d("2026-08-24"), fee: 25 },
      { date: d("2026-08-26"), fee: 25 },
    ];
    expect(paidSessionsInWindow(sessions, first)).toBe(4);
    expect(meetsPaidSessionThreshold(sessions, first)).toBe(true);
  });

  it("no first attendance means the threshold is not met", () => {
    expect(meetsPaidSessionThreshold([], null)).toBe(false);
  });
});

describe("tierAmountFor — boundary at exactly 3 sessions/week", () => {
  it("3 or more sessions/week pays $50", () => {
    expect(tierAmountFor(3)).toBe(50);
    expect(tierAmountFor(5)).toBe(50);
  });

  it("1–2 sessions/week pays $30", () => {
    expect(tierAmountFor(2)).toBe(30);
    expect(tierAmountFor(1)).toBe(30);
  });

  it("0 or unset is not assessable (null)", () => {
    expect(tierAmountFor(0)).toBeNull();
    expect(tierAmountFor(null)).toBeNull();
    expect(tierAmountFor(undefined)).toBeNull();
  });
});
