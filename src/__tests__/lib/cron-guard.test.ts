import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

import { acquireCronLock } from "@/lib/cron-guard";

describe("acquireCronLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fix the date so period keys are deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T10:00:00Z"));
  });

  it("acquires lock when no prior run exists", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue(null);
    prismaMock.cronRun.create.mockResolvedValue({
      id: "run-1",
      cronName: "daily-digest",
      period: "2025-06-15",
      status: "running",
    });

    const guard = await acquireCronLock("daily-digest", "daily");

    expect(guard.acquired).toBe(true);
    expect(prismaMock.cronRun.create).toHaveBeenCalledWith({
      data: {
        cronName: "daily-digest",
        period: "2025-06-15",
        status: "running",
      },
    });
  });

  it("rejects when cron already completed for this period", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue({
      id: "run-1",
      cronName: "daily-digest",
      period: "2025-06-15",
      status: "completed",
      startedAt: new Date("2025-06-15T08:00:00Z"),
    });

    const guard = await acquireCronLock("daily-digest", "daily");

    expect(guard.acquired).toBe(false);
    expect(guard.reason).toContain("already completed");
    expect(prismaMock.cronRun.create).not.toHaveBeenCalled();
  });

  it("rejects when cron is actively running (under 10 min)", async () => {
    // Started 5 minutes ago
    prismaMock.cronRun.findUnique.mockResolvedValue({
      id: "run-1",
      cronName: "daily-digest",
      period: "2025-06-15",
      status: "running",
      startedAt: new Date("2025-06-15T09:55:00Z"),
    });

    const guard = await acquireCronLock("daily-digest", "daily");

    expect(guard.acquired).toBe(false);
    expect(guard.reason).toContain("already running");
  });

  it("recovers stale running lock (over 10 min) and re-acquires", async () => {
    // Started 15 minutes ago — stale
    prismaMock.cronRun.findUnique.mockResolvedValue({
      id: "run-stale",
      cronName: "daily-digest",
      period: "2025-06-15",
      status: "running",
      startedAt: new Date("2025-06-15T09:45:00Z"),
    });

    prismaMock.cronRun.delete.mockResolvedValue({});
    prismaMock.cronRun.create.mockResolvedValue({
      id: "run-2",
      cronName: "daily-digest",
      period: "2025-06-15",
      status: "running",
    });

    const guard = await acquireCronLock("daily-digest", "daily");

    expect(guard.acquired).toBe(true);
    expect(prismaMock.cronRun.delete).toHaveBeenCalled();
    expect(prismaMock.cronRun.create).toHaveBeenCalled();
  });

  it("handles race condition (P2002 unique constraint)", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue(null);
    prismaMock.cronRun.create.mockRejectedValue({ code: "P2002" });

    const guard = await acquireCronLock("daily-digest", "daily");

    expect(guard.acquired).toBe(false);
    expect(guard.reason).toContain("lock contention");
  });

  it("complete() marks the run as completed with details", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue(null);
    prismaMock.cronRun.create.mockResolvedValue({
      id: "run-3",
      cronName: "daily-digest",
      period: "2025-06-15",
      status: "running",
    });
    prismaMock.cronRun.update.mockResolvedValue({});

    const guard = await acquireCronLock("daily-digest", "daily");
    expect(guard.acquired).toBe(true);

    await guard.complete({ emailsSent: 5 });

    expect(prismaMock.cronRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-3" },
        data: expect.objectContaining({
          status: "completed",
        }),
      }),
    );
  });

  it("fail() marks the run as failed", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue(null);
    prismaMock.cronRun.create.mockResolvedValue({
      id: "run-4",
      cronName: "daily-digest",
      period: "2025-06-15",
      status: "running",
    });
    prismaMock.cronRun.update.mockResolvedValue({});

    const guard = await acquireCronLock("daily-digest", "daily");
    await guard.fail(new Error("SMTP timeout"));

    expect(prismaMock.cronRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-4" },
        data: expect.objectContaining({
          status: "failed",
        }),
      }),
    );
  });

  it("uses weekly period key for weekly crons", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue(null);
    prismaMock.cronRun.create.mockResolvedValue({
      id: "run-w",
      cronName: "weekly-report",
      period: "2025-W25",
      status: "running",
    });

    const guard = await acquireCronLock("weekly-report", "weekly");

    expect(guard.acquired).toBe(true);
    const createCall = prismaMock.cronRun.create.mock.calls[0][0];
    expect(createCall.data.period).toMatch(/^\d{4}-W\d{2}$/);
  });
});
