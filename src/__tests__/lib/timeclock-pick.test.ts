import { describe, it, expect } from "vitest";
import {
  pickEligibleShift,
  inferSessionType,
  type PickShift,
} from "@/lib/timeclock-pick";

function makeShift(
  shiftStart: string,
  overrides: Partial<PickShift> = {},
): PickShift {
  return {
    id: `s-${shiftStart}`,
    date: new Date("2026-05-04"),
    shiftStart,
    shiftEnd: "18:00",
    actualStart: null,
    actualEnd: null,
    ...overrides,
  };
}

describe("pickEligibleShift — clock in", () => {
  const now = new Date("2026-05-04T15:00:00");

  it("returns 'none' for an empty list", () => {
    expect(pickEligibleShift([], now, "in")).toEqual({ kind: "none" });
  });

  it("returns 'match' for a single shift inside the ±2h window", () => {
    const shift = makeShift("15:00");
    const result = pickEligibleShift([shift], now, "in");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.shift.id).toBe(shift.id);
  });

  it("includes a shift starting 1.5h after now (still within window)", () => {
    const shift = makeShift("16:30");
    expect(pickEligibleShift([shift], now, "in").kind).toBe("match");
  });

  it("includes a shift starting 1.5h before now (still within window)", () => {
    const shift = makeShift("13:30");
    expect(pickEligibleShift([shift], now, "in").kind).toBe("match");
  });

  it("excludes a shift starting >2h after now", () => {
    const shift = makeShift("17:30"); // 2h30 after
    expect(pickEligibleShift([shift], now, "in").kind).toBe("none");
  });

  it("excludes a shift starting >2h before now", () => {
    const shift = makeShift("12:30"); // 2h30 before
    expect(pickEligibleShift([shift], now, "in").kind).toBe("none");
  });

  it("excludes shifts that have already been clocked in", () => {
    const shift = makeShift("15:00", {
      actualStart: new Date("2026-05-04T14:55:00"),
    });
    expect(pickEligibleShift([shift], now, "in").kind).toBe("none");
  });

  it("returns 'ambiguous' when two shifts are both in the window", () => {
    // BSC at 7am won't match — out of window. ASC at 15:00 matches.
    // VC at 14:00 is within window too (1h before now).
    const shifts = [
      makeShift("15:00"), // ASC, on time
      makeShift("14:00"), // VC, 1h before now
    ];
    const result = pickEligibleShift(shifts, now, "in");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
    }
  });
});

describe("pickEligibleShift — clock out", () => {
  const now = new Date("2026-05-04T18:30:00");

  it("matches the only open (clocked-in) shift", () => {
    const open = makeShift("15:00", {
      actualStart: new Date("2026-05-04T15:02:00"),
    });
    const closed = makeShift("07:00", {
      actualStart: new Date("2026-05-04T06:55:00"),
      actualEnd: new Date("2026-05-04T09:00:00"),
    });
    const future = makeShift("19:00");
    const result = pickEligibleShift([open, closed, future], now, "out");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.shift.id).toBe(open.id);
  });

  it("returns 'none' when no shift is currently open", () => {
    const closed = makeShift("15:00", {
      actualStart: new Date("2026-05-04T15:00:00"),
      actualEnd: new Date("2026-05-04T18:00:00"),
    });
    expect(pickEligibleShift([closed], now, "out").kind).toBe("none");
  });

  it("returns 'ambiguous' when more than one shift is open at once", () => {
    // Unusual data shape (two open shifts simultaneously) — function
    // refuses to pick arbitrarily, returns 'ambiguous' for the UI to
    // surface a picker.
    const open1 = makeShift("15:00", {
      actualStart: new Date("2026-05-04T15:00:00"),
    });
    const open2 = makeShift("16:00", {
      actualStart: new Date("2026-05-04T16:00:00"),
    });
    const result = pickEligibleShift([open1, open2], now, "out");
    expect(result.kind).toBe("ambiguous");
  });

  it("ignores the ±2h window — staff may clock out hours late", () => {
    const open = makeShift("09:00", {
      shiftEnd: "12:00",
      actualStart: new Date("2026-05-04T08:55:00"),
    });
    // now is 18:30 — 6+ hours past shiftEnd, but the row is still open.
    expect(pickEligibleShift([open], now, "out").kind).toBe("match");
  });
});

describe("inferSessionType", () => {
  it("returns 'bsc' before 9am", () => {
    expect(inferSessionType(new Date("2026-05-04T07:30:00"))).toBe("bsc");
    expect(inferSessionType(new Date("2026-05-04T08:59:00"))).toBe("bsc");
  });
  it("returns 'vc' between 9am and 2pm", () => {
    expect(inferSessionType(new Date("2026-05-04T09:00:00"))).toBe("vc");
    expect(inferSessionType(new Date("2026-05-04T13:59:00"))).toBe("vc");
  });
  it("returns 'asc' from 2pm onward", () => {
    expect(inferSessionType(new Date("2026-05-04T14:00:00"))).toBe("asc");
    expect(inferSessionType(new Date("2026-05-04T19:00:00"))).toBe("asc");
  });
});
