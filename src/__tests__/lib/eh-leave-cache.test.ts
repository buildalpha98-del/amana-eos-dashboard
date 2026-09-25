import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// Mock the EH payroll lib — the cache must never hit the real API.
vi.mock("@/lib/eh-payroll", () => ({
  isConfigured: vi.fn(() => true),
  listAllLeaveRequests: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { isConfigured, listAllLeaveRequests } from "@/lib/eh-payroll";
import { logger } from "@/lib/logger";
import {
  getApprovedEhLeave,
  _clearEhLeaveCache,
  EH_LEAVE_CACHE_TTL_MS,
} from "@/lib/eh-leave-cache";

const mockIsConfigured = vi.mocked(isConfigured);
const mockListAll = vi.mocked(listAllLeaveRequests);

function ehRow(overrides: Partial<{
  id: number;
  employeeId: number;
  fromDate: string;
  toDate: string;
  totalHours: number;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    employeeId: overrides.employeeId ?? 101,
    employee: "Jane Doe",
    leaveCategoryId: 7,
    leaveCategory: "Annual Leave",
    fromDate: overrides.fromDate ?? "2026-09-07T00:00:00",
    toDate: overrides.toDate ?? "2026-09-09T00:00:00",
    totalHours: overrides.totalHours ?? 22.8,
    status: "Approved",
    notes: null,
  };
}

describe("getApprovedEhLeave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearEhLeaveCache();
    mockIsConfigured.mockReturnValue(true);
  });

  it("maps approved EH rows to linked dashboard users and drops unlinked rows", async () => {
    mockListAll.mockResolvedValue([
      ehRow({ id: 1, employeeId: 101 }),
      ehRow({ id: 2, employeeId: 202, fromDate: "2026-09-14T00:00:00", toDate: "2026-09-14T00:00:00", totalHours: 7.6 }),
      // employeeId 999 has no linked User — must be dropped.
      ehRow({ id: 3, employeeId: 999 }),
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-1", employmentHeroEmployeeId: 101 },
      { id: "user-2", employmentHeroEmployeeId: 202 },
    ]);

    const out = await getApprovedEhLeave();

    // Fetches Approved only.
    expect(mockListAll).toHaveBeenCalledWith("Approved");
    // One batched User lookup keyed on the deduped EH ids.
    const userCall = prismaMock.user.findMany.mock.calls[0]?.[0];
    expect(userCall.where.employmentHeroEmployeeId).toEqual({
      in: [101, 202, 999],
    });

    expect(out).toEqual([
      {
        userId: "user-1",
        fromDate: "2026-09-07T00:00:00",
        toDate: "2026-09-09T00:00:00",
        totalHours: 22.8,
      },
      {
        userId: "user-2",
        fromDate: "2026-09-14T00:00:00",
        toDate: "2026-09-14T00:00:00",
        totalHours: 7.6,
      },
    ]);
  });

  it("caches the mapped result within the TTL — one upstream call for repeat reads", async () => {
    mockListAll.mockResolvedValue([ehRow()]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-1", employmentHeroEmployeeId: 101 },
    ]);

    const first = await getApprovedEhLeave();
    const second = await getApprovedEhLeave();

    expect(second).toEqual(first);
    expect(mockListAll).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
    // Sanity: the TTL is the documented 5 minutes.
    expect(EH_LEAVE_CACHE_TTL_MS).toBe(5 * 60_000);
  });

  it("refetches after the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      mockListAll.mockResolvedValue([ehRow()]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: "user-1", employmentHeroEmployeeId: 101 },
      ]);

      await getApprovedEhLeave();
      vi.advanceTimersByTime(EH_LEAVE_CACHE_TTL_MS + 1);
      await getApprovedEhLeave();

      expect(mockListAll).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns [] without calling EH when unconfigured, logging once per process", async () => {
    mockIsConfigured.mockReturnValue(false);

    expect(await getApprovedEhLeave()).toEqual([]);
    expect(await getApprovedEhLeave()).toEqual([]);

    expect(mockListAll).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("returns [] and logs when EH errors, negative-caching the failure", async () => {
    mockListAll.mockRejectedValue(new Error("EH down"));

    expect(await getApprovedEhLeave()).toEqual([]);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    // Failure is cached for the TTL — no immediate re-stall against EH.
    expect(await getApprovedEhLeave()).toEqual([]);
    expect(mockListAll).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
