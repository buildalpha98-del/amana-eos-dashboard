import { describe, it, expect } from "vitest";
import {
  quarterLabel,
  shiftQuarter,
  calendarQuarterToFinancial,
} from "@/lib/utils";

describe("FY quarter labelling", () => {
  it("maps each month to the right FY quarter", () => {
    const cases: [string, string][] = [
      ["2026-07-01", "Q1-FY27"], ["2026-09-30", "Q1-FY27"],
      ["2026-10-01", "Q2-FY27"], ["2026-12-31", "Q2-FY27"],
      ["2027-01-01", "Q3-FY27"], ["2027-03-31", "Q3-FY27"],
      ["2027-04-01", "Q4-FY27"], ["2027-06-30", "Q4-FY27"],
      ["2027-07-01", "Q1-FY28"],
    ];
    for (const [iso, expected] of cases) {
      expect(quarterLabel(new Date(`${iso}T00:00:00`)), iso).toBe(expected);
    }
  });

  it("shifts across FY boundaries", () => {
    expect(shiftQuarter("Q1-FY27", -1)).toBe("Q4-FY26");
    expect(shiftQuarter("Q4-FY27", 1)).toBe("Q1-FY28");
    expect(shiftQuarter("Q1-FY27", 4)).toBe("Q1-FY28");
    expect(shiftQuarter("Q1-FY27", -4)).toBe("Q1-FY26");
    expect(shiftQuarter("garbage", 1)).toBe("garbage");
  });

  it("remaps legacy calendar labels 1:1", () => {
    expect(calendarQuarterToFinancial("Q3-2026")).toBe("Q1-FY27");
    expect(calendarQuarterToFinancial("Q4-2026")).toBe("Q2-FY27");
    expect(calendarQuarterToFinancial("Q1-2027")).toBe("Q3-FY27");
    expect(calendarQuarterToFinancial("Q2-2027")).toBe("Q4-FY27");
    // idempotent + safe on junk
    expect(calendarQuarterToFinancial("Q1-FY27")).toBe("Q1-FY27");
    expect(calendarQuarterToFinancial("")).toBe("");
  });

  it("round-trips: label(date) equals remap(old calendar label)", () => {
    for (let m = 0; m < 24; m++) {
      const d = new Date(2026, m, 15);
      const calQ = Math.ceil((d.getMonth() + 1) / 3);
      const legacy = `Q${calQ}-${d.getFullYear()}`;
      expect(calendarQuarterToFinancial(legacy), legacy).toBe(quarterLabel(d));
    }
  });
});
