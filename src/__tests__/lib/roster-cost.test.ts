import { describe, it, expect } from "vitest";
import {
  hoursBetween,
  projectCost,
  timeToMinutes,
} from "@/lib/roster-cost";

describe("timeToMinutes", () => {
  it("converts HH:mm to minutes", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("01:30")).toBe(90);
    expect(timeToMinutes("15:45")).toBe(945);
  });
  it("returns 0 for invalid input", () => {
    expect(timeToMinutes("oops")).toBe(0);
  });
});

describe("hoursBetween", () => {
  it("computes positive ranges", () => {
    expect(hoursBetween("15:00", "18:00")).toBe(3);
    expect(hoursBetween("06:30", "09:00")).toBe(2.5);
  });
  it("returns 0 for inverted/zero ranges instead of negatives", () => {
    expect(hoursBetween("18:00", "15:00")).toBe(0);
    expect(hoursBetween("09:00", "09:00")).toBe(0);
  });
});

describe("projectCost", () => {
  it("returns zeros for an empty week", () => {
    const out = projectCost([], new Map());
    expect(out).toEqual({
      totalHours: 0,
      totalCost: 0,
      unpricedHours: 0,
      byUser: [],
    });
  });

  it("aggregates hours per user and multiplies by their pay rate", () => {
    // Alice: two ASC shifts → 6h × $35 = $210
    // Bob: one BSC shift → 1.5h × $40 = $60
    const out = projectCost(
      [
        { userId: "u-alice", shiftStart: "15:00", shiftEnd: "18:00" },
        { userId: "u-alice", shiftStart: "15:00", shiftEnd: "18:00" },
        { userId: "u-bob", shiftStart: "07:30", shiftEnd: "09:00" },
      ],
      new Map([
        ["u-alice", 35],
        ["u-bob", 40],
      ]),
    );
    expect(out.totalHours).toBe(7.5);
    expect(out.totalCost).toBe(270);
    expect(out.unpricedHours).toBe(0);
    // Sorted: highest cost first
    expect(out.byUser.map((r) => r.userId)).toEqual(["u-alice", "u-bob"]);
    expect(out.byUser[0]).toMatchObject({ hours: 6, payRate: 35, cost: 210 });
    expect(out.byUser[1]).toMatchObject({ hours: 1.5, payRate: 40, cost: 60 });
  });

  it("buckets unpriced hours when a user has no contract", () => {
    // Carol has no entry in the rate map → her hours sit in unpriced.
    const out = projectCost(
      [
        { userId: "u-alice", shiftStart: "15:00", shiftEnd: "18:00" },
        { userId: "u-carol", shiftStart: "15:00", shiftEnd: "19:00" },
      ],
      new Map([["u-alice", 30]]),
    );
    expect(out.totalHours).toBe(7);
    expect(out.totalCost).toBe(90); // alice only
    expect(out.unpricedHours).toBe(4);
    // Priced row sorted before unpriced.
    expect(out.byUser[0]).toMatchObject({ userId: "u-alice", cost: 90 });
    expect(out.byUser[1]).toMatchObject({ userId: "u-carol", cost: null });
  });

  it("skips open (unassigned) shifts so they don't appear as unpriced", () => {
    const out = projectCost(
      [
        { userId: null, shiftStart: "15:00", shiftEnd: "18:00" },
        { userId: "u-alice", shiftStart: "15:00", shiftEnd: "18:00" },
      ],
      new Map([["u-alice", 30]]),
    );
    expect(out.totalHours).toBe(3); // alice only
    expect(out.unpricedHours).toBe(0);
    expect(out.byUser).toHaveLength(1);
  });

  it("ignores zero/negative-duration shifts defensively", () => {
    const out = projectCost(
      [
        { userId: "u-alice", shiftStart: "18:00", shiftEnd: "15:00" }, // inverted
        { userId: "u-alice", shiftStart: "09:00", shiftEnd: "09:00" }, // zero
        { userId: "u-alice", shiftStart: "15:00", shiftEnd: "18:00" }, // 3h
      ],
      new Map([["u-alice", 25]]),
    );
    expect(out.totalHours).toBe(3);
    expect(out.totalCost).toBe(75);
  });

  it("rounds totals to 2 decimal places", () => {
    // 1h 7m = 67min = 1.1166...h × $30 = $33.50
    const out = projectCost(
      [{ userId: "u-1", shiftStart: "10:00", shiftEnd: "11:07" }],
      new Map([["u-1", 30]]),
    );
    expect(out.totalHours).toBeCloseTo(1.12, 2);
    expect(out.totalCost).toBeCloseTo(33.5, 2);
  });
});
