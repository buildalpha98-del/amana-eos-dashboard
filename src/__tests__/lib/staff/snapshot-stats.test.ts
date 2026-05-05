import { describe, it, expect } from "vitest";
import {
  computeSnapshotStats,
  type SnapshotStatsInput,
} from "@/lib/staff/snapshot-stats";

const ASOF = new Date("2026-05-04T10:00:00Z");

function daysFrom(asOf: Date, offset: number): Date {
  const d = new Date(asOf);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function makeInput(overrides: Partial<SnapshotStatsInput> = {}): SnapshotStatsInput {
  return {
    user: { createdAt: new Date("2026-02-01T00:00:00Z") },
    earliestContractStart: null,
    nextShift: null,
    certificates: [],
    activeRocks: 0,
    openTodos: 0,
    ...overrides,
  };
}

describe("computeSnapshotStats — tenure", () => {
  it("renders '0 years 3 months' for a 3-month-old account", () => {
    const out = computeSnapshotStats(makeInput(), ASOF);
    expect(out.tenure).toBe("0 years 3 months");
  });

  it("renders '1 year 2 months' (singular year)", () => {
    const out = computeSnapshotStats(
      makeInput({ user: { createdAt: new Date("2025-03-04T00:00:00Z") } }),
      ASOF,
    );
    expect(out.tenure).toBe("1 year 2 months");
  });

  it("renders '2 years 6 months'", () => {
    const out = computeSnapshotStats(
      makeInput({ user: { createdAt: new Date("2023-11-04T00:00:00Z") } }),
      ASOF,
    );
    expect(out.tenure).toBe("2 years 6 months");
  });

  it("uses earliestContractStart when older than User.createdAt", () => {
    const out = computeSnapshotStats(
      makeInput({
        user: { createdAt: new Date("2026-04-01T00:00:00Z") },
        earliestContractStart: new Date("2024-05-04T00:00:00Z"),
      }),
      ASOF,
    );
    expect(out.tenure).toBe("2 years 0 months");
  });

  it("ignores earliestContractStart when newer than User.createdAt", () => {
    const out = computeSnapshotStats(
      makeInput({
        user: { createdAt: new Date("2026-02-01T00:00:00Z") },
        earliestContractStart: new Date("2026-04-01T00:00:00Z"),
      }),
      ASOF,
    );
    expect(out.tenure).toBe("0 years 3 months");
  });

  it("clamps to '0 years 0 months' on a future start date", () => {
    const out = computeSnapshotStats(
      makeInput({ user: { createdAt: new Date("2027-01-01T00:00:00Z") } }),
      ASOF,
    );
    expect(out.tenure).toBe("0 years 0 months");
  });
});

describe("computeSnapshotStats — nextShiftLabel", () => {
  it("returns null when nextShift is null (UI renders placeholder)", () => {
    const out = computeSnapshotStats(makeInput(), ASOF);
    expect(out.nextShiftLabel).toBe(null);
  });

  it("formats a labelled shift with day + time + session + service", () => {
    const out = computeSnapshotStats(
      makeInput({
        nextShift: {
          date: new Date("2026-05-05T00:00:00Z"),
          shiftStart: "15:00",
          shiftEnd: "18:00",
          sessionType: "asc",
          service: { name: "Mawson Lakes" },
        },
      }),
      ASOF,
    );
    expect(out.nextShiftLabel).toMatch(
      /^Tue, 5 May, 15:00–18:00 · ASC · Mawson Lakes$/,
    );
  });

  it("omits the service segment when service is null", () => {
    const out = computeSnapshotStats(
      makeInput({
        nextShift: {
          date: new Date("2026-05-05T00:00:00Z"),
          shiftStart: "07:00",
          shiftEnd: "09:00",
          sessionType: "bsc",
          service: null,
        },
      }),
      ASOF,
    );
    expect(out.nextShiftLabel).toBe("Tue, 5 May, 07:00–09:00 · BSC");
  });
});

describe("computeSnapshotStats — certCounts", () => {
  it("classifies certs into valid / expiring / expired buckets", () => {
    const out = computeSnapshotStats(
      makeInput({
        certificates: [
          { expiryDate: daysFrom(ASOF, 60) }, // valid
          { expiryDate: daysFrom(ASOF, 100) }, // valid
          { expiryDate: daysFrom(ASOF, 14) }, // expiring
          { expiryDate: daysFrom(ASOF, -5) }, // expired
        ],
      }),
      ASOF,
    );
    expect(out.certCounts).toEqual({ valid: 2, expiring: 1, expired: 1 });
  });

  it("returns zero counts when there are no certificates", () => {
    const out = computeSnapshotStats(makeInput(), ASOF);
    expect(out.certCounts).toEqual({ valid: 0, expiring: 0, expired: 0 });
  });

  it("treats certs at exactly +30d as expiring (boundary check)", () => {
    const out = computeSnapshotStats(
      makeInput({ certificates: [{ expiryDate: daysFrom(ASOF, 30) }] }),
      ASOF,
    );
    expect(out.certCounts).toEqual({ valid: 0, expiring: 1, expired: 0 });
  });
});

describe("computeSnapshotStats — passthrough counts", () => {
  it("passes activeRocks and openTodos through unchanged", () => {
    const out = computeSnapshotStats(
      makeInput({ activeRocks: 3, openTodos: 7 }),
      ASOF,
    );
    expect(out.activeRocks).toBe(3);
    expect(out.openTodos).toBe(7);
  });
});
