import { describe, it, expect } from "vitest";
import { getWeekWindow, getPreviousWeekWindow } from "@/lib/cockpit/week";

describe("getWeekWindow", () => {
  it("returns Mon 00:00 → Sun 23:59:59.999 for a Wednesday", () => {
    // 2026-04-22 is a Wednesday
    const wed = new Date(2026, 3, 22, 14, 30);
    const { start, end } = getWeekWindow(wed);

    expect(start.getDay()).toBe(1); // Monday
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);

    expect(end.getDay()).toBe(0); // Sunday
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);

    // Mon 00:00 → Sun 23:59:59.999 ≈ 7 days minus 1ms
    const daysDiff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(daysDiff).toBe(7);
  });

  it("handles Sunday correctly (belongs to the week just ending)", () => {
    const sun = new Date(2026, 3, 26, 18, 0); // Sunday
    const { start, end } = getWeekWindow(sun);

    expect(start.getDay()).toBe(1);
    expect(end.getDay()).toBe(0);
    // The Sunday passed in must be inside [start, end]
    expect(sun.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(sun.getTime()).toBeLessThanOrEqual(end.getTime());
  });

  it("handles Monday correctly (start of the window)", () => {
    const mon = new Date(2026, 3, 20, 9, 0);
    const { start } = getWeekWindow(mon);

    expect(start.getDate()).toBe(20);
    expect(start.getHours()).toBe(0);
  });
});

describe("getPreviousWeekWindow", () => {
  it("shifts the window back by 7 days", () => {
    const ref = new Date(2026, 3, 22, 12, 0);
    const curr = getWeekWindow(ref);
    const prev = getPreviousWeekWindow(ref);

    expect(prev.start.getTime()).toBe(curr.start.getTime() - 7 * 86_400_000);
    expect(prev.end.getTime()).toBe(curr.end.getTime() - 7 * 86_400_000);
  });
});
