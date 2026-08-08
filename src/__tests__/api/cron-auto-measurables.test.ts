import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

const guardComplete = vi.fn(async () => {});
const guardFail = vi.fn(async () => {});
vi.mock("@/lib/cron-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-guard")>("@/lib/cron-guard");
  return {
    ...actual,
    acquireCronLock: vi.fn(async () => ({
      acquired: true,
      complete: guardComplete,
      fail: guardFail,
    })),
  };
});

import { GET } from "@/app/api/cron/auto-measurables/route";
import { acquireCronLock } from "@/lib/cron-guard";

function authed() {
  return createRequest("GET", "/api/cron/auto-measurables", {
    headers: { authorization: "Bearer test-secret" },
  });
}

/**
 * Expected weekOf — MUST mirror the auto-measurables computation byte-for-byte
 * (the @@unique([measurableId, weekOf]) key duplicates otherwise).
 */
function expectedWeekOf(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const thisMonday = new Date(now);
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  thisMonday.setDate(now.getDate() + mondayOffset);
  thisMonday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  return lastMonday;
}

function upsertArgFor(measurableId: string) {
  const call = prismaMock.measurableEntry.upsert.mock.calls.find(
    (c: Array<{ where: { measurableId_weekOf: { measurableId: string } } }>) =>
      c[0].where.measurableId_weekOf.measurableId === measurableId,
  );
  return call?.[0];
}

function attendanceRow(overrides: Record<string, unknown> = {}) {
  return {
    serviceId: "svc-1",
    sessionType: "bsc",
    attended: 0,
    capacity: 0,
    enrolled: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  // Sunday 2026-08-09 06:30 AM — the real cron slot ("30 6 * * 1" AEST-ish).
  vi.setSystemTime(new Date("2026-08-10T06:30:00.000Z"));

  prismaMock.measurable.findMany.mockResolvedValue([]);
  prismaMock.dailyAttendance.findMany.mockResolvedValue([]);
  prismaMock.measurableEntry.upsert.mockResolvedValue({});
});

afterAll(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/auto-measurables", () => {
  it("401 when CRON_SECRET wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/auto-measurables", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.measurable.findMany).not.toHaveBeenCalled();
  });

  it("idempotent — skipped when guard not acquired", async () => {
    vi.mocked(acquireCronLock).mockResolvedValueOnce({
      acquired: false,
      reason: "already complete",
      complete: async () => {},
      fail: async () => {},
    });
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(prismaMock.measurable.findMany).not.toHaveBeenCalled();
  });

  it("returns an early-exit message when no attendance-related measurables are found", async () => {
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("No attendance-related measurables found");
    expect(data.populated).toBe(0);
    expect(prismaMock.dailyAttendance.findMany).not.toHaveBeenCalled();
    expect(guardComplete).toHaveBeenCalledTimes(1);
  });

  describe("title-dispatch branches", () => {
    it("'BSC occupancy' matches the BSC branch, NOT the bare-occupancy branch", async () => {
      prismaMock.measurable.findMany.mockResolvedValue([
        { id: "m-bsc", title: "BSC Occupancy", serviceId: "svc-1", ownerId: "u1", goalValue: 80, goalDirection: "above" },
      ]);
      prismaMock.dailyAttendance.findMany.mockResolvedValue([
        attendanceRow({ sessionType: "bsc", attended: 8, capacity: 10 }),
        // ASC data present too — if the bare-occupancy branch fired instead,
        // it would blend BSC+ASC and produce a different value.
        attendanceRow({ sessionType: "asc", attended: 2, capacity: 10 }),
      ]);

      const res = await GET(authed());
      const data = await res.json();
      expect(data.populated).toBe(1);

      const call = upsertArgFor("m-bsc");
      // BSC-only: 8/10 = 80%. Bare occupancy would be (8+2)/(10+10) = 50%.
      expect(call.create.value).toBe(80);
    });

    it("'ASC occupancy' matches the ASC branch, NOT the bare-occupancy branch", async () => {
      prismaMock.measurable.findMany.mockResolvedValue([
        { id: "m-asc", title: "ASC Occupancy", serviceId: "svc-1", ownerId: "u1", goalValue: 80, goalDirection: "above" },
      ]);
      prismaMock.dailyAttendance.findMany.mockResolvedValue([
        attendanceRow({ sessionType: "bsc", attended: 9, capacity: 10 }),
        attendanceRow({ sessionType: "asc", attended: 2, capacity: 10 }),
      ]);

      const res = await GET(authed());
      const data = await res.json();
      expect(data.populated).toBe(1);

      const call = upsertArgFor("m-asc");
      // ASC-only: 2/10 = 20%. Bare occupancy would be (9+2)/(10+10) = 55%.
      expect(call.create.value).toBe(20);
    });

    it("bare 'occupancy' (no bsc/asc qualifier) blends both session types", async () => {
      prismaMock.measurable.findMany.mockResolvedValue([
        { id: "m-all", title: "Overall Occupancy", serviceId: "svc-1", ownerId: "u1", goalValue: 80, goalDirection: "above" },
      ]);
      prismaMock.dailyAttendance.findMany.mockResolvedValue([
        attendanceRow({ sessionType: "bsc", attended: 8, capacity: 10 }),
        attendanceRow({ sessionType: "asc", attended: 2, capacity: 10 }),
      ]);

      const res = await GET(authed());
      const data = await res.json();
      expect(data.populated).toBe(1);

      const call = upsertArgFor("m-all");
      expect(call.create.value).toBe(50); // (8+2)/(10+10)
    });

    it("'total enrolled' sums enrolled across the service's attendance rows", async () => {
      prismaMock.measurable.findMany.mockResolvedValue([
        { id: "m-enr", title: "Total Enrolled", serviceId: "svc-1", ownerId: "u1", goalValue: 50, goalDirection: "above" },
      ]);
      prismaMock.dailyAttendance.findMany.mockResolvedValue([
        attendanceRow({ enrolled: 20 }),
        attendanceRow({ enrolled: 15 }),
      ]);

      await GET(authed());
      const call = upsertArgFor("m-enr");
      expect(call.create.value).toBe(35);
    });

    it("'total attended' sums attended across the service's attendance rows", async () => {
      prismaMock.measurable.findMany.mockResolvedValue([
        { id: "m-att", title: "Total Attended", serviceId: "svc-1", ownerId: "u1", goalValue: 50, goalDirection: "above" },
      ]);
      prismaMock.dailyAttendance.findMany.mockResolvedValue([
        attendanceRow({ attended: 12 }),
        attendanceRow({ attended: 9 }),
      ]);

      await GET(authed());
      const call = upsertArgFor("m-att");
      expect(call.create.value).toBe(21);
    });
  });

  describe("service scoping", () => {
    it("serviceId-scoped measurable with NO matching attendance rows is skipped (continue)", async () => {
      prismaMock.measurable.findMany.mockResolvedValue([
        { id: "m-scoped", title: "BSC Occupancy", serviceId: "svc-missing", ownerId: "u1", goalValue: 80, goalDirection: "above" },
      ]);
      prismaMock.dailyAttendance.findMany.mockResolvedValue([
        attendanceRow({ serviceId: "svc-1", sessionType: "bsc", attended: 8, capacity: 10 }),
      ]);

      const res = await GET(authed());
      const data = await res.json();
      expect(data.populated).toBe(0);
      expect(prismaMock.measurableEntry.upsert).not.toHaveBeenCalled();
    });

    it("null-serviceId measurable falls back to the aggregate across ALL services", async () => {
      prismaMock.measurable.findMany.mockResolvedValue([
        { id: "m-agg", title: "BSC Occupancy", serviceId: null, ownerId: "u1", goalValue: 80, goalDirection: "above" },
      ]);
      prismaMock.dailyAttendance.findMany.mockResolvedValue([
        attendanceRow({ serviceId: "svc-1", sessionType: "bsc", attended: 8, capacity: 10 }),
        attendanceRow({ serviceId: "svc-2", sessionType: "bsc", attended: 4, capacity: 10 }),
      ]);

      const res = await GET(authed());
      const data = await res.json();
      expect(data.populated).toBe(1);
      const call = upsertArgFor("m-agg");
      // Aggregated across both services: (8+4)/(10+10) = 60%.
      expect(call.create.value).toBe(60);
    });
  });

  it("divide-by-zero (zero capacity) yields 0, not NaN/Infinity", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      { id: "m-zero", title: "BSC Occupancy", serviceId: "svc-1", ownerId: "u1", goalValue: 80, goalDirection: "above" },
    ]);
    prismaMock.dailyAttendance.findMany.mockResolvedValue([
      attendanceRow({ serviceId: "svc-1", sessionType: "bsc", attended: 0, capacity: 0 }),
    ]);

    await GET(authed());
    const call = upsertArgFor("m-zero");
    expect(call.create.value).toBe(0);
    expect(Number.isFinite(call.create.value)).toBe(true);
  });

  it("collects per-measurable errors[] without aborting the batch", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      { id: "m-good", title: "Total Enrolled", serviceId: "svc-1", ownerId: "u1", goalValue: 10, goalDirection: "above" },
      { id: "m-bad", title: "Total Attended", serviceId: "svc-1", ownerId: "u1", goalValue: 10, goalDirection: "above" },
    ]);
    prismaMock.dailyAttendance.findMany.mockResolvedValue([
      attendanceRow({ serviceId: "svc-1", enrolled: 5, attended: 5 }),
    ]);
    prismaMock.measurableEntry.upsert.mockImplementation(
      async (args: { where: { measurableId_weekOf: { measurableId: string } } }) => {
        if (args.where.measurableId_weekOf.measurableId === "m-bad") {
          throw new Error("upsert failed");
        }
        return {};
      },
    );

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.populated).toBe(1);
    expect(data.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("m-bad")]),
    );
    expect(guardComplete).toHaveBeenCalledTimes(1);
  });

  it("fails the guard and 500s when a query throws", async () => {
    prismaMock.measurable.findMany.mockRejectedValue(new Error("db down"));
    const res = await GET(authed());
    expect(res.status).toBe(500);
    expect(guardFail).toHaveBeenCalledTimes(1);
    expect(guardComplete).not.toHaveBeenCalled();
  });

  it("guard.complete is called with useful counts on success", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      { id: "m-enr", title: "Total Enrolled", serviceId: "svc-1", ownerId: "u1", goalValue: 10, goalDirection: "above" },
    ]);
    prismaMock.dailyAttendance.findMany.mockResolvedValue([
      attendanceRow({ serviceId: "svc-1", enrolled: 5 }),
    ]);

    await GET(authed());
    expect(guardComplete).toHaveBeenCalledWith(
      expect.objectContaining({ measurablesFound: 1, populated: 1 }),
    );
  });

  it("weekOf matches the byte-identical computation used by marketing-measurables", async () => {
    prismaMock.measurable.findMany.mockResolvedValue([
      { id: "m-enr", title: "Total Enrolled", serviceId: "svc-1", ownerId: "u1", goalValue: 10, goalDirection: "above" },
    ]);
    prismaMock.dailyAttendance.findMany.mockResolvedValue([
      attendanceRow({ serviceId: "svc-1", enrolled: 5 }),
    ]);

    await GET(authed());
    const call = upsertArgFor("m-enr");
    const weekOf = expectedWeekOf();
    expect(call.where.measurableId_weekOf.weekOf.getTime()).toBe(weekOf.getTime());
    expect(call.create.weekOf.getTime()).toBe(weekOf.getTime());
  });
});
