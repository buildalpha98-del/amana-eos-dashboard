import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  getFocusAvatarSlimForWeek,
  getFocusAvatarForWeek,
  rotationIndexForWeek,
} from "@/lib/avatar-focus-rotation";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rotationIndexForWeek", () => {
  it("returns 0 when serviceCount is 0", () => {
    expect(rotationIndexForWeek(new Date(), 0)).toBe(0);
  });

  it("returns the same index for two days within the same week", () => {
    const wed = new Date("2026-04-22T15:00:00Z");
    const fri = new Date("2026-04-24T05:00:00Z");
    expect(rotationIndexForWeek(wed, 10)).toBe(rotationIndexForWeek(fri, 10));
  });

  it("returns a different index for the following week", () => {
    const wed = new Date("2026-04-22T15:00:00Z");
    const nextWed = new Date("2026-04-29T15:00:00Z");
    expect(rotationIndexForWeek(wed, 10)).not.toBe(rotationIndexForWeek(nextWed, 10));
  });

  it("wraps via modulo of serviceCount", () => {
    const a = new Date("2026-04-22T00:00:00Z");
    expect(rotationIndexForWeek(a, 3)).toBeGreaterThanOrEqual(0);
    expect(rotationIndexForWeek(a, 3)).toBeLessThan(3);
  });
});

describe("getFocusAvatarSlimForWeek", () => {
  it("returns null when no active services", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    const result = await getFocusAvatarSlimForWeek(new Date("2026-04-22T00:00:00Z"));
    expect(result).toBeNull();
  });

  it("returns one of the active services in deterministic rotation", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: "s1", name: "Centre A", code: "AAA" },
      { id: "s2", name: "Centre B", code: "BBB" },
      { id: "s3", name: "Centre C", code: "CCC" },
    ]);
    const r1 = await getFocusAvatarSlimForWeek(new Date("2026-04-22T00:00:00Z"));
    const r2 = await getFocusAvatarSlimForWeek(new Date("2026-04-23T00:00:00Z"));
    expect(r1).toEqual(r2);
    expect(["s1", "s2", "s3"]).toContain(r1?.serviceId);
  });
});

describe("getFocusAvatarForWeek", () => {
  it("returns null when no active services", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    const result = await getFocusAvatarForWeek(new Date("2026-04-22T00:00:00Z"));
    expect(result).toBeNull();
  });

  it("returns null when focus service has no avatar yet", async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: "s1", name: "Centre A", code: "AAA" }]);
    prismaMock.centreAvatar.findUnique.mockResolvedValue(null);
    expect(await getFocusAvatarForWeek(new Date())).toBeNull();
  });

  it("returns full avatar payload when present", async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: "s1", name: "Centre A", code: "AAA" }]);
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "av-1",
      snapshot: { centreDetails: { officialName: "Centre A" } },
      parentAvatar: { demographics: { ageRange: "30-45" } },
      programmeMix: { whatsWorking: "Quran club" },
      assetLibrary: { photoLibrary: [] },
    });
    const result = await getFocusAvatarForWeek(new Date("2026-04-22T00:00:00Z"));
    expect(result?.serviceId).toBe("s1");
    expect(result?.serviceName).toBe("Centre A");
    expect(result?.avatarId).toBe("av-1");
    expect(result?.snapshot).toEqual({ centreDetails: { officialName: "Centre A" } });
  });
});
