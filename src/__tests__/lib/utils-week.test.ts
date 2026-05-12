import { describe, it, expect } from "vitest";
import { getWeekStart, getPreviousWeekStart } from "@/lib/utils";

/**
 * Both helpers return Monday 00:00 local-time. The week is
 * Mon → Sun (ISO convention), and getPreviousWeekStart subtracts
 * exactly 7 days from getWeekStart.
 *
 * Drives the L10 To-Do Review section: this week's meeting reviews
 * last week's commitments (per Bucket N spec, 2026-05-12).
 */
describe("getWeekStart", () => {
  it("returns Monday for a mid-week date", () => {
    const wed = new Date("2026-05-13T14:00:00"); // Wednesday
    const start = getWeekStart(wed);
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(11); // Mon 11 May
  });

  it("returns the same Monday when called on a Monday", () => {
    const mon = new Date("2026-05-11T09:30:00");
    const start = getWeekStart(mon);
    expect(start.getDate()).toBe(11);
    expect(start.getDay()).toBe(1);
  });

  it("returns the PREVIOUS Monday when called on a Sunday", () => {
    const sun = new Date("2026-05-17T20:00:00"); // Sunday
    const start = getWeekStart(sun);
    expect(start.getDate()).toBe(11);
    expect(start.getDay()).toBe(1);
  });
});

describe("getPreviousWeekStart", () => {
  it("is exactly 7 days before getWeekStart for the same date", () => {
    const today = new Date("2026-05-13T14:00:00");
    const thisWeek = getWeekStart(today);
    const lastWeek = getPreviousWeekStart(today);
    expect(thisWeek.getTime() - lastWeek.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("is the Monday of the previous week for a Wednesday", () => {
    const wed = new Date("2026-05-13T14:00:00"); // Wed of week starting Mon 11
    const lastWeek = getPreviousWeekStart(wed);
    expect(lastWeek.getDate()).toBe(4); // Mon 4 May
    expect(lastWeek.getDay()).toBe(1);
  });

  it("crosses month boundaries cleanly", () => {
    const earlyMay = new Date("2026-05-04T10:00:00"); // Mon 4 May
    const lastWeek = getPreviousWeekStart(earlyMay);
    expect(lastWeek.getMonth()).toBe(3); // April (0-indexed)
    expect(lastWeek.getDate()).toBe(27); // Mon 27 Apr
  });
});
