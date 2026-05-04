import { describe, it, expect } from "vitest";
import {
  hoursBetween,
  payRateForShift,
  projectCost,
  timeToMinutes,
  type ContractWindow,
} from "@/lib/roster-cost";

const MON = "2026-05-04";
const TUE = "2026-05-05";
const WED = "2026-05-06";
const THU = "2026-05-07";
const FRI = "2026-05-08";

function shift(
  userId: string | null,
  date: string,
  start: string,
  end: string,
) {
  return { userId, date, shiftStart: start, shiftEnd: end };
}

function contract(
  userId: string,
  payRate: number,
  startDate: string,
  endDate: string | null = null,
): ContractWindow {
  return {
    userId,
    payRate,
    startDate: new Date(`${startDate}T00:00:00Z`),
    endDate: endDate ? new Date(`${endDate}T00:00:00Z`) : null,
  };
}

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

describe("payRateForShift", () => {
  it("returns null when no contracts match the user", () => {
    expect(
      payRateForShift([contract("u-1", 30, MON)], "u-other", new Date(MON)),
    ).toBe(null);
  });

  it("returns null when shift date is before any contract started", () => {
    expect(
      payRateForShift(
        [contract("u-1", 30, WED)],
        "u-1",
        new Date(`${MON}T00:00:00Z`),
      ),
    ).toBe(null);
  });

  it("returns null when shift date is after the contract ended", () => {
    expect(
      payRateForShift(
        [contract("u-1", 30, MON, TUE)],
        "u-1",
        new Date(`${WED}T00:00:00Z`),
      ),
    ).toBe(null);
  });

  it("returns the rate when the contract window contains the shift date", () => {
    expect(
      payRateForShift(
        [contract("u-1", 30, MON, FRI)],
        "u-1",
        new Date(`${WED}T00:00:00Z`),
      ),
    ).toBe(30);
  });

  it("picks the most-recently-started contract when windows overlap", () => {
    const contracts = [
      contract("u-1", 30, MON), // open-ended from Mon
      contract("u-1", 35, WED), // open-ended from Wed (newer)
    ];
    expect(
      payRateForShift(contracts, "u-1", new Date(`${THU}T00:00:00Z`)),
    ).toBe(35);
  });
});

describe("projectCost", () => {
  it("returns zeros for an empty week", () => {
    const out = projectCost([], []);
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
        shift("u-alice", MON, "15:00", "18:00"),
        shift("u-alice", TUE, "15:00", "18:00"),
        shift("u-bob", MON, "07:30", "09:00"),
      ],
      [contract("u-alice", 35, MON), contract("u-bob", 40, MON)],
    );
    expect(out.totalHours).toBe(7.5);
    expect(out.totalCost).toBe(270);
    expect(out.unpricedHours).toBe(0);
    expect(out.byUser.map((r) => r.userId)).toEqual(["u-alice", "u-bob"]);
    expect(out.byUser[0]).toMatchObject({ hours: 6, payRate: 35, cost: 210 });
    expect(out.byUser[1]).toMatchObject({ hours: 1.5, payRate: 40, cost: 60 });
  });

  it("buckets unpriced hours when a user has no contract on the shift date", () => {
    const out = projectCost(
      [
        shift("u-alice", MON, "15:00", "18:00"),
        shift("u-carol", MON, "15:00", "19:00"),
      ],
      [contract("u-alice", 30, MON)],
    );
    expect(out.totalHours).toBe(7);
    expect(out.totalCost).toBe(90);
    expect(out.unpricedHours).toBe(4);
    expect(out.byUser[0]).toMatchObject({ userId: "u-alice", cost: 90 });
    expect(out.byUser[1]).toMatchObject({ userId: "u-carol", cost: null });
  });

  it("skips open (unassigned) shifts", () => {
    const out = projectCost(
      [
        shift(null, MON, "15:00", "18:00"),
        shift("u-alice", MON, "15:00", "18:00"),
      ],
      [contract("u-alice", 30, MON)],
    );
    expect(out.totalHours).toBe(3);
    expect(out.unpricedHours).toBe(0);
    expect(out.byUser).toHaveLength(1);
  });

  it("ignores zero/negative-duration shifts defensively", () => {
    const out = projectCost(
      [
        shift("u-alice", MON, "18:00", "15:00"),
        shift("u-alice", MON, "09:00", "09:00"),
        shift("u-alice", MON, "15:00", "18:00"),
      ],
      [contract("u-alice", 25, MON)],
    );
    expect(out.totalHours).toBe(3);
    expect(out.totalCost).toBe(75);
  });

  it("rounds totals to 2 decimal places", () => {
    const out = projectCost(
      [shift("u-1", MON, "10:00", "11:07")],
      [contract("u-1", 30, MON)],
    );
    expect(out.totalHours).toBeCloseTo(1.12, 2);
    expect(out.totalCost).toBeCloseTo(33.5, 2);
  });

  // ── Mid-week rate change scenarios ───────────────────────────────

  it("prorates correctly across a Tuesday→Wednesday rate change", () => {
    // Alice has 3h shifts Mon-Fri (15h total).
    // Old contract $30/h ran Mon→Tue (superseded).
    // New contract $40/h started Wed (open-ended).
    // Expected: Mon+Tue (6h × 30) + Wed+Thu+Fri (9h × 40) = 180 + 360 = 540
    const out = projectCost(
      [
        shift("u-alice", MON, "15:00", "18:00"),
        shift("u-alice", TUE, "15:00", "18:00"),
        shift("u-alice", WED, "15:00", "18:00"),
        shift("u-alice", THU, "15:00", "18:00"),
        shift("u-alice", FRI, "15:00", "18:00"),
      ],
      [
        contract("u-alice", 30, MON, TUE),
        contract("u-alice", 40, WED),
      ],
    );
    expect(out.totalHours).toBe(15);
    expect(out.totalCost).toBe(540);
    expect(out.byUser).toHaveLength(1);
    expect(out.byUser[0]).toMatchObject({
      userId: "u-alice",
      hours: 15,
      // Primary rate = the rate from the most recently-started
      // contract that priced any hours this week.
      payRate: 40,
      cost: 540,
      proratedHours: 6, // the Mon+Tue hours at the older rate
    });
  });

  it("counts pre-rate-change hours as unpriced when there's no overlapping older contract", () => {
    // Alice's only contract starts Wed. Mon/Tue shifts have no
    // contract — those hours are unpriced.
    const out = projectCost(
      [
        shift("u-alice", MON, "15:00", "18:00"),
        shift("u-alice", WED, "15:00", "18:00"),
      ],
      [contract("u-alice", 40, WED)],
    );
    expect(out.totalHours).toBe(6);
    expect(out.totalCost).toBe(120); // Wed only
    expect(out.unpricedHours).toBe(3); // Mon
    expect(out.byUser[0]).toMatchObject({
      userId: "u-alice",
      hours: 6,
      payRate: 40,
      cost: 120,
      proratedHours: 0,
    });
  });

  it("keeps payRate=null when none of the user's shifts have a contract", () => {
    const out = projectCost(
      [shift("u-alice", MON, "15:00", "18:00")],
      [contract("u-alice", 30, FRI)], // contract starts AFTER the shift
    );
    expect(out.totalHours).toBe(3);
    expect(out.totalCost).toBe(0);
    expect(out.unpricedHours).toBe(3);
    expect(out.byUser[0]).toMatchObject({
      userId: "u-alice",
      payRate: null,
      cost: null,
      proratedHours: 0,
    });
  });

  it("treats two same-rate overlapping contracts as a single rate (no proration noise)", () => {
    // Some admins issue a renewal contract at the same rate. We
    // shouldn't spuriously flag those hours as prorated.
    const out = projectCost(
      [
        shift("u-alice", MON, "15:00", "18:00"),
        shift("u-alice", THU, "15:00", "18:00"),
      ],
      [
        contract("u-alice", 30, MON, WED),
        contract("u-alice", 30, WED), // same rate, new window
      ],
    );
    expect(out.totalCost).toBe(180);
    expect(out.byUser[0]).toMatchObject({
      payRate: 30,
      proratedHours: 0,
    });
  });

  it("accepts Date objects on shifts (not just YYYY-MM-DD strings)", () => {
    const out = projectCost(
      [
        {
          userId: "u-1",
          date: new Date(`${MON}T00:00:00Z`),
          shiftStart: "15:00",
          shiftEnd: "18:00",
        },
      ],
      [contract("u-1", 30, MON)],
    );
    expect(out.totalCost).toBe(90);
  });
});
