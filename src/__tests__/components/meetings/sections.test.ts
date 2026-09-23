import { describe, it, expect } from "vitest";
import { L10_SECTIONS, getMeetingSections } from "@/components/meetings/sections";
import { QUARTERLY_PULSE_SECTIONS } from "@/components/meetings/quarterly-sections";

describe("getMeetingSections", () => {
  it("returns L10_SECTIONS for l10 (the default run sheet)", () => {
    expect(getMeetingSections("l10")).toBe(L10_SECTIONS);
  });

  it("returns QUARTERLY_PULSE_SECTIONS for quarterly_pulse", () => {
    expect(getMeetingSections("quarterly_pulse")).toBe(QUARTERLY_PULSE_SECTIONS);
  });

  it("keeps the seven-step L10 run sheet untouched", () => {
    expect(L10_SECTIONS.map((s) => s.key)).toEqual([
      "segue",
      "scorecard",
      "rocks",
      "headlines",
      "todos",
      "ids",
      "conclude",
    ]);
  });

  it("matches the Quarterly Pulse pack's seven steps and durations", () => {
    expect(QUARTERLY_PULSE_SECTIONS.map((s) => ({ key: s.key, duration: s.duration }))).toEqual([
      { key: "segue", duration: 15 },
      { key: "quarter_review", duration: 45 },
      { key: "vto", duration: 20 },
      { key: "break", duration: 10 },
      { key: "set_rocks", duration: 75 },
      { key: "ids", duration: 30 },
      { key: "conclude", duration: 15 },
    ]);
  });
});
