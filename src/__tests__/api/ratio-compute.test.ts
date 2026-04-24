import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

import {
  computeLiveRatios,
  resolveMinRatio,
  type SessionTypeKey,
} from "@/lib/ratio-compute";

describe("resolveMinRatio", () => {
  it("returns the federal default when settings are null", () => {
    expect(resolveMinRatio(null, "bsc")).toBe("1:15");
  });

  it("pulls per-session overrides from settings Json", () => {
    const settings = {
      bsc: { ratio: "1:10" },
      asc: { ratio: "1:15" },
      vc: { ratio: "1:11" },
    };
    expect(resolveMinRatio(settings, "bsc")).toBe("1:10");
    expect(resolveMinRatio(settings, "vc")).toBe("1:11");
  });

  it("ignores malformed ratio strings", () => {
    expect(resolveMinRatio({ bsc: { ratio: "bogus" } }, "bsc")).toBe("1:15");
  });
});

describe("computeLiveRatios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty list when service not found", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await computeLiveRatios("s-missing");
    expect(res).toEqual([]);
  });

  it("computes below-ratio=true when too many children for educator count", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: "s1",
      ratioSettings: null,
    });
    // Fix "now" to 10:30 local
    const now = new Date();
    now.setHours(10, 30, 0, 0);
    prismaMock.rosterShift.findMany.mockResolvedValue([
      {
        userId: "u1",
        staffName: "Mirna",
        sessionType: "asc",
        shiftStart: "10:00",
        shiftEnd: "18:00",
      },
    ]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue(
      // 20 children in ASC — well over 1:15
      Array.from({ length: 20 }, (_, i) => ({
        id: `a${i}`,
        sessionType: "asc" as const,
      })),
    );

    const rows = await computeLiveRatios("s1", now);
    expect(rows).toHaveLength(3);
    const asc = rows.find((r) => r.sessionType === "asc")!;
    expect(asc.educatorCount).toBe(1);
    expect(asc.childCount).toBe(20);
    expect(asc.belowRatio).toBe(true);
    expect(asc.ratioText).toBe("1:20");
    expect(asc.minRatio).toBe("1:15");
  });

  it("respects per-service ratioSettings override", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: "s1",
      ratioSettings: { bsc: { ratio: "1:10" }, asc: { ratio: "1:15" }, vc: { ratio: "1:11" } },
    });
    const now = new Date();
    now.setHours(7, 30, 0, 0); // BSC time
    prismaMock.rosterShift.findMany.mockResolvedValue([
      {
        userId: "u1",
        staffName: "Tracie",
        sessionType: "bsc",
        shiftStart: "07:00",
        shiftEnd: "09:00",
      },
    ]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        id: `a${i}`,
        sessionType: "bsc" as const,
      })),
    );
    const [bsc] = await computeLiveRatios("s1", now);
    expect(bsc.sessionType).toBe("bsc");
    expect(bsc.minRatio).toBe("1:10");
    expect(bsc.belowRatio).toBe(true); // 1:11 > 1:10
  });

  it("excludes shifts that haven't started or have ended", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: "s1",
      ratioSettings: null,
    });
    const now = new Date();
    now.setHours(15, 0, 0, 0);
    prismaMock.rosterShift.findMany.mockResolvedValue([
      // Past shift
      {
        userId: "u1",
        staffName: "A",
        sessionType: "asc",
        shiftStart: "07:00",
        shiftEnd: "09:00",
      },
      // Future shift
      {
        userId: "u2",
        staffName: "B",
        sessionType: "asc",
        shiftStart: "16:00",
        shiftEnd: "18:00",
      },
      // Active shift
      {
        userId: "u3",
        staffName: "C",
        sessionType: "asc",
        shiftStart: "14:00",
        shiftEnd: "17:00",
      },
    ]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([
      { id: "a1", sessionType: "asc" as const },
    ]);
    const rows = await computeLiveRatios("s1", now);
    const asc = rows.find((r) => r.sessionType === "asc")!;
    expect(asc.educatorCount).toBe(1);
    expect(asc.educatorIds).toEqual(["u3"]);
  });
});
