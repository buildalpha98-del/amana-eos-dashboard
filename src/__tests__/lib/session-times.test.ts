import { describe, it, expect } from "vitest";
import {
  toMinutes,
  durationMinutes,
  formatDuration,
  formatSessionOfCare,
  isValidWindow,
  describeWindowProblem,
  sessionTimeOptionLabel,
  compareSessionTimes,
} from "@/lib/session-times";

describe("toMinutes", () => {
  it("parses a zero-padded 24-hour time", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("06:30")).toBe(390);
    expect(toMinutes("18:30")).toBe(1110);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("rejects anything that isn't HH:mm", () => {
    for (const bad of ["9:00", "6:30am", "24:00", "12:60", "", "  ", "abc"]) {
      expect(toMinutes(bad), bad).toBeNull();
    }
  });

  it("rejects null and undefined", () => {
    expect(toMinutes(null)).toBeNull();
    expect(toMinutes(undefined)).toBeNull();
  });
});

describe("durationMinutes", () => {
  it("measures the windows from the centre's session times", () => {
    expect(durationMinutes("06:30", "09:00")).toBe(150); // 2.5h
    expect(durationMinutes("15:00", "18:30")).toBe(210); // 3.5h
    expect(durationMinutes("07:00", "18:00")).toBe(660); // 11h
    expect(durationMinutes("13:00", "18:30")).toBe(330); // 5.5h
    expect(durationMinutes("14:00", "18:00")).toBe(240); // 4h
  });

  it("rejects a window that ends before it starts", () => {
    // Never wrapped to the next day: OSHC doesn't run overnight, so this
    // is always a typo, and treating 18:00-06:30 as 12.5 hours would put
    // a 12.5-hour session of care on a CCS claim.
    expect(durationMinutes("18:00", "06:30")).toBeNull();
  });

  it("rejects a zero-length window", () => {
    expect(durationMinutes("15:00", "15:00")).toBeNull();
  });

  it("rejects when either end is unparseable", () => {
    expect(durationMinutes("9:00", "18:00")).toBeNull();
    expect(durationMinutes("09:00", "6pm")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("drops the decimal on whole hours", () => {
    expect(formatDuration("07:00", "18:00")).toBe("11 hours");
    expect(formatDuration("14:00", "18:00")).toBe("4 hours");
  });

  it("keeps a single decimal on half hours", () => {
    expect(formatDuration("06:30", "09:00")).toBe("2.5 hours");
    expect(formatDuration("15:00", "18:30")).toBe("3.5 hours");
    expect(formatDuration("13:00", "18:30")).toBe("5.5 hours");
  });

  it("says hour, singular, for exactly one", () => {
    expect(formatDuration("09:00", "10:00")).toBe("1 hour");
  });

  it("returns null for an invalid window rather than NaN", () => {
    expect(formatDuration("18:00", "06:30")).toBeNull();
    expect(formatDuration("", "")).toBeNull();
  });
});

describe("formatSessionOfCare", () => {
  it("matches the fees-matrix format, to two decimals", () => {
    expect(formatSessionOfCare("15:00", "18:30")).toBe("15:00-18:30 (3.50H)");
    expect(formatSessionOfCare("14:00", "18:00")).toBe("14:00-18:00 (4.00H)");
    expect(formatSessionOfCare("14:00", "18:30")).toBe("14:00-18:30 (4.50H)");
  });

  it("degrades to the raw window rather than showing NaN hours", () => {
    expect(formatSessionOfCare("18:00", "06:30")).toBe("18:00-06:30");
    expect(formatSessionOfCare(null, null)).toBe("?-?");
  });
});

describe("isValidWindow / describeWindowProblem", () => {
  it("accepts a good window with no complaint", () => {
    expect(isValidWindow("06:30", "09:00")).toBe(true);
    expect(describeWindowProblem("06:30", "09:00")).toBeNull();
  });

  it("asks for both times when one is missing", () => {
    expect(describeWindowProblem("06:30", "")).toMatch(/both a start and an end/i);
    expect(describeWindowProblem("", "09:00")).toMatch(/both a start and an end/i);
  });

  it("names the offending value when a time is malformed", () => {
    expect(describeWindowProblem("6:30", "09:00")).toContain("6:30");
    expect(describeWindowProblem("06:30", "9pm")).toContain("9pm");
  });

  it("explains a backwards window", () => {
    expect(describeWindowProblem("18:00", "06:30")).toMatch(
      /end time has to be after/i,
    );
  });
});

describe("sessionTimeOptionLabel", () => {
  it("leads with the name when there is one", () => {
    expect(
      sessionTimeOptionLabel({
        id: "a",
        start: "14:00",
        end: "18:00",
        label: "Ramadan Care",
      }),
    ).toBe("Ramadan Care — 14:00-18:00 (4.00H)");
  });

  it("falls back to the window alone", () => {
    expect(
      sessionTimeOptionLabel({ id: "a", start: "15:00", end: "18:30", label: null }),
    ).toBe("15:00-18:30 (3.50H)");
  });

  it("treats a whitespace-only label as no label", () => {
    expect(
      sessionTimeOptionLabel({ id: "a", start: "15:00", end: "18:30", label: "   " }),
    ).toBe("15:00-18:30 (3.50H)");
  });
});

describe("compareSessionTimes", () => {
  it("orders by start time, earliest first", () => {
    const sorted = [
      { start: "15:00", end: "18:30" },
      { start: "06:30", end: "09:00" },
      { start: "07:00", end: "18:00" },
    ].sort(compareSessionTimes);
    expect(sorted.map((s) => s.start)).toEqual(["06:30", "07:00", "15:00"]);
  });

  it("puts the shorter window first when two start together", () => {
    const sorted = [
      { start: "14:00", end: "18:30" },
      { start: "14:00", end: "18:00" },
    ].sort(compareSessionTimes);
    expect(sorted.map((s) => s.end)).toEqual(["18:00", "18:30"]);
  });

  it("does not throw on an unparseable entry", () => {
    const sorted = [
      { start: "15:00", end: "18:30" },
      { start: "nonsense", end: "also nonsense" },
    ].sort(compareSessionTimes);
    expect(sorted).toHaveLength(2);
  });
});
