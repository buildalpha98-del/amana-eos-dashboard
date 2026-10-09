import { describe, it, expect } from "vitest";
import {
  compareShift,
  summarisePeople,
  clockTime,
} from "@/lib/centre-timesheets";
import type { RosterShiftListItem } from "@/hooks/useRosterShifts";
import { currentWeekStartIso } from "@/components/roster/WeekPicker";
import { vi } from "vitest";

const shift: RosterShiftListItem = {
  id: "s1",
  userId: "u1",
  staffName: "Test Educator",
  date: "2026-10-09T00:00:00.000Z",
  sessionType: "asc",
  shiftStart: "15:00",
  shiftEnd: "18:00",
  role: null,
  status: "published",
  user: { id: "u1", name: "Test Educator", avatar: null },
  actualStart: null,
  actualEnd: null,
};
const now = new Date("2026-10-09T19:00:00+11:00");
describe("centre timesheet comparisons in Sydney time", () => {
  it("flags late over five minutes and early finish, with elapsed difference", () => {
    const row = compareShift(
      {
        ...shift,
        actualStart: "2026-10-09T15:06:00+11:00",
        actualEnd: "2026-10-09T17:56:00+11:00",
      },
      now,
    );
    expect(row.flags).toEqual(["Late in", "Early out"]);
    expect(row.actualMinutes).toBe(170);
    expect(row.difference).toBe(-10);
  });
  it("does not flag five minutes late or a future shift as missing", () => {
    expect(
      compareShift(
        {
          ...shift,
          actualStart: "2026-10-09T15:05:00+11:00",
          actualEnd: "2026-10-09T18:00:00+11:00",
        },
        now,
      ).flags,
    ).toEqual([]);
    expect(
      compareShift(shift, new Date("2026-10-09T14:00:00+11:00")).flags,
    ).toEqual([]);
    expect(compareShift(shift, now).flags).toContain("No clock-in");
  });
  it("keeps unfinished clocks pending instead of inflating worked hours", () => {
    const row = compareShift(
      { ...shift, actualStart: "2026-10-09T15:00:00+11:00" },
      now,
    );
    expect(row.flags).toContain("Still clocked in");
    expect(row.actualMinutes).toBeNull();
    expect(row.difference).toBeNull();
    expect(summarisePeople([row])[0]).toMatchObject({
      rosterMinutes: 180,
      actualMinutes: 0,
      pending: 1,
    });
  });
  it("does not treat an unscheduled clock as a rostered shift", () => {
    const row = compareShift(
      {
        ...shift,
        status: "unscheduled",
        actualStart: "2026-10-09T16:00:00+11:00",
        actualEnd: "2026-10-09T17:00:00+11:00",
      },
      now,
    );
    expect(row.flags).toEqual(["No rostered shift"]);
    expect(row.rosterMinutes).toBe(0);
    expect(row.difference).toBe(60);
  });
  it("distinguishes drafts and unassigned shifts from missed clock-ins", () => {
    expect(compareShift({ ...shift, status: "draft" }, now).flags).toEqual([
      "Draft roster",
    ]);
    expect(
      compareShift({ ...shift, userId: null, user: null }, now).flags,
    ).toEqual(["Unassigned shift"]);
  });
  it("compares overnight clocks across dates and totals multiple shifts", () => {
    const row = compareShift(
      {
        ...shift,
        shiftStart: "23:00",
        shiftEnd: "01:00",
        actualStart: "2026-10-09T23:00:00+11:00",
        actualEnd: "2026-10-10T01:00:00+11:00",
      },
      now,
    );
    expect(row.flags).toEqual([]);
    expect(row.difference).toBe(0);
    expect(
      summarisePeople([row, { ...row, shift: { ...row.shift, id: "s2" } }])[0],
    ).toMatchObject({ rosterMinutes: 240, actualMinutes: 240, pending: 0 });
  });
  it("formats UTC instants as Sydney clock time", () => {
    expect(clockTime("2026-10-09T04:00:00Z")).toBe("15:00");
    expect(clockTime(null)).toBe("—");
  });
  it("starts the new week on Sydney Monday even while UTC is Sunday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T14:00:00Z"));
    try {
      expect(currentWeekStartIso()).toBe("2026-10-12");
    } finally {
      vi.useRealTimers();
    }
  });
});
