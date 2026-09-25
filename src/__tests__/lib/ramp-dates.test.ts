import { describe, it, expect } from "vitest";
import { addDays, checkpointDueDate, rampDay, rampEndDate, weeklyCheckInDates } from "@/lib/ramp/dates";

describe("ramp dates", () => {
  const start = new Date(Date.UTC(2026, 8, 14)); // Monday 14 Sep 2026

  it("ends 90 days after start", () => {
    expect(rampEndDate(start).toISOString().slice(0, 10)).toBe("2026-12-13");
  });

  it("counts whole days elapsed", () => {
    expect(rampDay(start, start)).toBe(0);
    expect(rampDay(start, addDays(start, 30))).toBe(30);
    expect(rampDay(start, new Date(start.getTime() + 89.9 * 86_400_000))).toBe(89);
  });

  it("schedules 13 Fridays at 05:00 UTC starting the first Friday on/after start", () => {
    const dates = weeklyCheckInDates(start);
    expect(dates).toHaveLength(13);
    expect(dates[0].toISOString()).toBe("2026-09-18T05:00:00.000Z");
    for (const d of dates) expect(d.getUTCDay()).toBe(5);
    expect(dates[12].toISOString().slice(0, 10)).toBe("2026-12-11");
  });

  it("a Friday start is its own first check-in", () => {
    const fri = new Date(Date.UTC(2026, 8, 18));
    expect(weeklyCheckInDates(fri)[0].toISOString().slice(0, 10)).toBe("2026-09-18");
  });

  it("checkpoints fall at 20:30 UTC on start + day", () => {
    expect(checkpointDueDate(start, 30).toISOString()).toBe("2026-10-14T20:30:00.000Z");
    expect(checkpointDueDate(start, 90).toISOString()).toBe("2026-12-13T20:30:00.000Z");
  });
});
