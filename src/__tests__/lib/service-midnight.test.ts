import { describe, expect, it } from "vitest";
import { addDaysUTC, serviceMidnight } from "@/lib/timezone";

describe("Sydney calendar day boundaries", () => {
  it.each([
    ["2026-10-12", "2026-10-11T13:00:00.000Z", 24],
    ["2026-07-12", "2026-07-11T14:00:00.000Z", 24],
    ["2026-10-04", "2026-10-03T14:00:00.000Z", 23],
    ["2026-04-05", "2026-04-04T13:00:00.000Z", 25],
  ])("%s starts at %s and lasts %d hours", (date, expected, hours) => {
    const day = new Date(`${date}T00:00:00Z`);
    const start = serviceMidnight(day);
    expect(start.toISOString()).toBe(expected);
    expect(
      (serviceMidnight(addDaysUTC(day, 1)).getTime() - start.getTime()) /
        3_600_000,
    ).toBe(hours);
  });
});
