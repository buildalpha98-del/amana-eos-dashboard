import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});

import { createStaffRamp } from "@/lib/ramp/create";

const start = new Date(Date.UTC(2026, 8, 14));

describe("createStaffRamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.staffRamp.findUnique.mockResolvedValue(null);
    prismaMock.staffRamp.create.mockResolvedValue({ id: "ramp-1", endDate: new Date(Date.UTC(2026, 11, 13)) });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it("is idempotent on userId", async () => {
    prismaMock.staffRamp.findUnique.mockResolvedValue({ id: "ramp-existing" });
    const res = await createStaffRamp(prismaMock as never, "u1", start);
    expect(res).toEqual({ created: false, rampId: "ramp-existing" });
    expect(prismaMock.staffRamp.create).not.toHaveBeenCalled();
  });

  it("seeds 13 weekly check-ins and 30/60/90 checkpoints, none skipped when created before start", async () => {
    const res = await createStaffRamp(prismaMock as never, "u1", start, new Date(Date.UTC(2026, 8, 10)));
    expect(res).toEqual({ created: true, rampId: "ramp-1" });
    const data = prismaMock.staffRamp.create.mock.calls[0][0].data;
    expect(data.userId).toBe("u1");
    expect(data.endDate.toISOString().slice(0, 10)).toBe("2026-12-13");
    expect(data.checkIns.create).toHaveLength(13);
    expect(data.checkIns.create.every((c: { skipped: boolean; sentAt: Date | null }) => !c.skipped && c.sentAt === null)).toBe(true);
    expect(data.checkpoints.create.map((c: { day: number }) => c.day)).toEqual([30, 60, 90]);
  });

  it("marks weeks that already passed as skipped (backfill) so the cron never sends them", async () => {
    const now = new Date(Date.UTC(2026, 9, 20)); // ~5 weeks in
    await createStaffRamp(prismaMock as never, "u1", start, now);
    const rows = prismaMock.staffRamp.create.mock.calls[0][0].data.checkIns.create as Array<{ weekNumber: number; skipped: boolean; sentAt: Date | null }>;
    const skipped = rows.filter((r) => r.skipped);
    expect(skipped.map((r) => r.weekNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(skipped.every((r) => r.sentAt instanceof Date)).toBe(true);
    expect(rows.filter((r) => !r.skipped)).toHaveLength(8);
  });

  it("stamps probationEndDate only when it is null", async () => {
    await createStaffRamp(prismaMock as never, "u1", start);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", probationEndDate: null },
      data: { probationEndDate: new Date(Date.UTC(2026, 11, 13)) },
    });
  });

  it("swallows errors and reports not-created", async () => {
    prismaMock.staffRamp.create.mockRejectedValue(new Error("db down"));
    const res = await createStaffRamp(prismaMock as never, "u1", start);
    expect(res).toEqual({ created: false, rampId: null });
  });
});
