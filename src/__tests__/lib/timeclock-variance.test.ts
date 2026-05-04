import { describe, it, expect } from "vitest";
import {
  computeVariance,
  varianceLabel,
} from "@/lib/timeclock-variance";

const DATE = "2026-05-04"; // a Monday

describe("computeVariance", () => {
  it("returns 'none' when actualStart is null", () => {
    const v = computeVariance({
      date: DATE,
      shiftStart: "15:00",
      shiftEnd: "18:00",
      actualStart: null,
      actualEnd: null,
    });
    expect(v.status).toBe("none");
    expect(v.startDeltaMin).toBeNull();
    expect(v.endDeltaMin).toBeNull();
  });

  it("returns 'active' when clocked in but not yet out", () => {
    const v = computeVariance({
      date: DATE,
      shiftStart: "15:00",
      shiftEnd: "18:00",
      actualStart: "2026-05-04T15:02:00",
      actualEnd: null,
    });
    expect(v.status).toBe("active");
    expect(v.startDeltaMin).toBe(2);
    expect(v.endDeltaMin).toBeNull();
  });

  it("returns 'on-time' when within ±5 min", () => {
    expect(
      computeVariance({
        date: DATE,
        shiftStart: "15:00",
        shiftEnd: "18:00",
        actualStart: "2026-05-04T15:00:00",
        actualEnd: "2026-05-04T18:00:00",
      }).status,
    ).toBe("on-time");
    expect(
      computeVariance({
        date: DATE,
        shiftStart: "15:00",
        shiftEnd: "18:00",
        actualStart: "2026-05-04T15:05:00",
        actualEnd: "2026-05-04T18:00:00",
      }).status,
    ).toBe("on-time");
  });

  it("returns 'late' from 6 min through 29 min", () => {
    expect(
      computeVariance({
        date: DATE,
        shiftStart: "15:00",
        shiftEnd: "18:00",
        actualStart: "2026-05-04T15:06:00",
        actualEnd: "2026-05-04T18:00:00",
      }).status,
    ).toBe("late");
    expect(
      computeVariance({
        date: DATE,
        shiftStart: "15:00",
        shiftEnd: "18:00",
        actualStart: "2026-05-04T15:29:00",
        actualEnd: "2026-05-04T18:00:00",
      }).status,
    ).toBe("late");
  });

  it("returns 'very-late' at 30 min and beyond", () => {
    expect(
      computeVariance({
        date: DATE,
        shiftStart: "15:00",
        shiftEnd: "18:00",
        actualStart: "2026-05-04T15:30:00",
        actualEnd: "2026-05-04T18:00:00",
      }).status,
    ).toBe("very-late");
    expect(
      computeVariance({
        date: DATE,
        shiftStart: "15:00",
        shiftEnd: "18:00",
        actualStart: "2026-05-04T16:30:00",
        actualEnd: "2026-05-04T18:00:00",
      }).status,
    ).toBe("very-late");
  });

  it("returns 'early' when clock-in is >5 min before scheduled", () => {
    const v = computeVariance({
      date: DATE,
      shiftStart: "15:00",
      shiftEnd: "18:00",
      actualStart: "2026-05-04T14:50:00",
      actualEnd: "2026-05-04T18:00:00",
    });
    expect(v.status).toBe("early");
    expect(v.startDeltaMin).toBe(-10);
  });

  it("computes endDeltaMin both directions", () => {
    const over = computeVariance({
      date: DATE,
      shiftStart: "15:00",
      shiftEnd: "18:00",
      actualStart: "2026-05-04T15:00:00",
      actualEnd: "2026-05-04T18:15:00",
    });
    expect(over.endDeltaMin).toBe(15);

    const under = computeVariance({
      date: DATE,
      shiftStart: "15:00",
      shiftEnd: "18:00",
      actualStart: "2026-05-04T15:00:00",
      actualEnd: "2026-05-04T17:30:00",
    });
    expect(under.endDeltaMin).toBe(-30);
  });
});

describe("varianceLabel", () => {
  it("formats no-clock state as a dash", () => {
    expect(
      varianceLabel({ status: "none", startDeltaMin: null, endDeltaMin: null }),
    ).toBe("—");
  });
  it("formats active state as 'active'", () => {
    expect(
      varianceLabel({ status: "active", startDeltaMin: 2, endDeltaMin: null }),
    ).toBe("active");
  });
  it("formats on-time exactly as +0", () => {
    expect(
      varianceLabel({ status: "on-time", startDeltaMin: 0, endDeltaMin: 0 }),
    ).toBe("+0");
  });
  it("formats late with leading +", () => {
    expect(
      varianceLabel({ status: "late", startDeltaMin: 12, endDeltaMin: 0 }),
    ).toBe("+12m");
  });
  it("formats early with the minus sign already on the number", () => {
    expect(
      varianceLabel({ status: "early", startDeltaMin: -10, endDeltaMin: 0 }),
    ).toBe("-10m");
  });
});
