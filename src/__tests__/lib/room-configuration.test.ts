/**
 * The room configuration advisor.
 *
 * The maths matters because it's the difference between paying a fifth
 * educator to supervise two spare places and either trimming the room or
 * filling it. The scoping matters more: an OSHC centre's rooms run at
 * different times of day, so the total that counts against approved
 * places is the biggest single room, not the sum of all of them.
 */
import { describe, it, expect } from "vitest";
import {
  analyseRoomConfiguration,
  capacityBoundaries,
  educatorsRequired,
  parseRatio,
} from "@/lib/room-configuration";
import type { SessionTimes } from "@/lib/service-settings";

const times: SessionTimes = {
  bsc: { start: "06:30", end: "09:00" },
  asc: { start: "15:00", end: "18:30" },
  vc: { start: "07:00", end: "18:00" },
};

describe("parseRatio", () => {
  it("reads a well-formed ratio and rejects the rest", () => {
    expect(parseRatio("1:15")).toEqual({ staff: 1, children: 15 });
    expect(parseRatio("2:30")).toEqual({ staff: 2, children: 30 });
    expect(parseRatio("1:0")).toBeNull();
    expect(parseRatio("fifteen")).toBeNull();
    expect(parseRatio(null)).toBeNull();
  });
});

describe("educatorsRequired", () => {
  it("rounds up — you cannot roster part of an educator", () => {
    expect(educatorsRequired(48, "1:12")).toBe(4);
    expect(educatorsRequired(49, "1:12")).toBe(5);
    expect(educatorsRequired(50, "1:12")).toBe(5);
    expect(educatorsRequired(45, "1:15")).toBe(3);
  });
});

describe("capacityBoundaries", () => {
  it("gives the trim-down and fill-up numbers either side", () => {
    // The exact case OWNA surfaces: 50 at 1:12 → 5 educators, but 48
    // would need 4 and 60 would use all 5.
    expect(capacityBoundaries(50, "1:12")).toEqual({
      trimTo: 48,
      fillTo: 60,
      required: 5,
    });
    expect(capacityBoundaries(50, "1:15")).toEqual({
      trimTo: 45,
      fillTo: 60,
      required: 4,
    });
  });
});

describe("analyseRoomConfiguration", () => {
  const base = {
    sessionTimes: times,
    approvedPlaces: 60,
    ratios: {},
    defaultRatio: "1:15",
  };

  it("stays quiet when every room sits on an educator boundary", () => {
    const out = analyseRoomConfiguration({
      ...base,
      capacities: { bsc: 45, asc: 60, vc: 45 },
    });
    expect(out).toEqual([]);
  });

  it("flags a room bigger than the service's approved places", () => {
    const out = analyseRoomConfiguration({
      ...base,
      approvedPlaces: 50,
      capacities: { bsc: 45, asc: 60, vc: 45 },
    });
    const error = out.find((a) => a.level === "error");
    expect(error?.key).toBe("asc");
    expect(error?.message).toContain("60");
    expect(error?.message).toContain("50 places");
  });

  it("does NOT add rooms together — they run at different times of day", () => {
    // Before school (45) + after school (45) + vacation care (45) is 135,
    // but no more than 45 children are ever on site at once. Summing
    // would report a breach on a perfectly legal centre.
    const out = analyseRoomConfiguration({
      ...base,
      approvedPlaces: 50,
      capacities: { bsc: 45, asc: 45, vc: 45 },
    });
    expect(out.filter((a) => a.level === "error")).toEqual([]);
  });

  it("suggests trimming or filling a room that wastes an educator", () => {
    const out = analyseRoomConfiguration({
      ...base,
      approvedPlaces: 60,
      ratios: { asc: "1:12" },
      capacities: { bsc: 45, asc: 50, vc: 45 },
    });
    const advice = out.find((a) => a.key === "asc");
    expect(advice?.level).toBe("warning");
    expect(advice?.message).toContain("5 educators");
    expect(advice?.message).toContain("48");
    expect(advice?.message).toContain("60");
  });

  it("uses the service default when a room carries no ratio of its own", () => {
    const out = analyseRoomConfiguration({
      ...base,
      capacities: { bsc: 45, asc: 45, vc: 45 },
      defaultRatio: "1:12",
    });
    // 45 at 1:12 needs 4 educators; 48 would fill them.
    expect(out.find((a) => a.key === "bsc")?.message).toContain("48");
  });

  it("says so when a room has no capacity, rather than passing it silently", () => {
    const out = analyseRoomConfiguration({
      ...base,
      capacities: { bsc: 45, vc: 45 },
    });
    const missing = out.find((a) => a.key === "asc");
    expect(missing?.level).toBe("warning");
    expect(missing?.message).toContain("No capacity set");
  });

  it("warns once when approved places aren't recorded at all", () => {
    const out = analyseRoomConfiguration({
      ...base,
      approvedPlaces: null,
      capacities: { bsc: 45, asc: 45, vc: 45 },
    });
    const svc = out.filter((a) => a.key === null);
    expect(svc).toHaveLength(1);
    expect(svc[0].message).toContain("Approved places aren't recorded");
  });

  it("ignores unnamed spare rooms entirely", () => {
    const out = analyseRoomConfiguration({
      ...base,
      capacities: { bsc: 45, asc: 45, vc: 45, extra2: 999 },
    });
    // extra2 has no label, so it isn't a room yet — no advice about it.
    expect(out.some((a) => a.key === "extra2")).toBe(false);
  });
});
