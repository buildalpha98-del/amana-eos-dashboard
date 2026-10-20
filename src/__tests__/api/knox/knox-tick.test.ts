import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

// Control the cron guard directly (auth + lock).
const verifyCronSecret = vi.fn();
const acquireCronLock = vi.fn();
vi.mock("@/lib/cron-guard", () => ({
  verifyCronSecret: (req: unknown) => verifyCronSecret(req),
  acquireCronLock: (name: string, period: string) =>
    acquireCronLock(name, period),
}));

const getKnoxSettings = vi.fn();
vi.mock("@/lib/knox/settings", () => ({
  getKnoxSettings: () => getKnoxSettings(),
}));

const sweepJobs = vi.fn();
const runEscalationSweep = vi.fn();
vi.mock("@/lib/knox", () => ({
  sweepJobs: (now: Date) => sweepJobs(now),
  runEscalationSweep: (db: unknown, now: Date) => runEscalationSweep(db, now),
}));

const ORIGINAL_ENV = { ...process.env };
const URL_PATH = "/api/cron/knox-tick";
const AUTH = { headers: { authorization: "Bearer test-cron-secret" } };

describe("/api/cron/knox-tick", () => {
  const complete = vi.fn().mockResolvedValue(undefined);
  const fail = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T02:00:00Z"));
    process.env.CRON_SECRET = "test-cron-secret";

    verifyCronSecret.mockReturnValue(null);
    acquireCronLock.mockResolvedValue({ acquired: true, complete, fail });
    getKnoxSettings.mockResolvedValue({ enabled: true, shadowMode: false });
    sweepJobs.mockResolvedValue({ processed: 3, reaped: 1 });
    runEscalationSweep.mockResolvedValue({ escalated: 2 });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects requests without the cron secret", async () => {
    verifyCronSecret.mockReturnValue({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/cron/knox-tick/route");
    const res = await GET(createRequest("GET", URL_PATH));
    expect(res.status).toBe(401);
    expect(acquireCronLock).not.toHaveBeenCalled();
    expect(sweepJobs).not.toHaveBeenCalled();
    expect(runEscalationSweep).not.toHaveBeenCalled();
  });

  it("takes the knox-tick 5min lock", async () => {
    const { GET } = await import("@/app/api/cron/knox-tick/route");
    await GET(createRequest("GET", URL_PATH, AUTH));
    expect(acquireCronLock).toHaveBeenCalledWith("knox-tick", "5min");
  });

  it("no-ops when the lock is not acquired", async () => {
    acquireCronLock.mockResolvedValue({
      acquired: false,
      reason: "already ran this window",
    });

    const { GET } = await import("@/app/api/cron/knox-tick/route");
    const res = await GET(createRequest("GET", URL_PATH, AUTH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(sweepJobs).not.toHaveBeenCalled();
    expect(runEscalationSweep).not.toHaveBeenCalled();
  });

  it("skips both sweeps (but completes the lock) when Knox is disabled", async () => {
    getKnoxSettings.mockResolvedValue({ enabled: false, shadowMode: false });

    const { GET } = await import("@/app/api/cron/knox-tick/route");
    const res = await GET(createRequest("GET", URL_PATH, AUTH));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: true, reason: "knox_disabled" });
    expect(sweepJobs).not.toHaveBeenCalled();
    expect(runEscalationSweep).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith({
      skipped: true,
      reason: "knox_disabled",
    });
    expect(fail).not.toHaveBeenCalled();
  });

  it("sweeps jobs then runs the escalation sweep and returns all counts", async () => {
    const { GET } = await import("@/app/api/cron/knox-tick/route");
    const res = await GET(createRequest("GET", URL_PATH, AUTH));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 3, reaped: 1, escalated: 2 });

    expect(sweepJobs).toHaveBeenCalledTimes(1);
    expect(runEscalationSweep).toHaveBeenCalledTimes(1);
    expect(sweepJobs.mock.invocationCallOrder[0]).toBeLessThan(
      runEscalationSweep.mock.invocationCallOrder[0],
    );

    const now = new Date("2026-10-20T02:00:00Z");
    expect(sweepJobs.mock.calls[0][0]).toEqual(now);
    expect(runEscalationSweep.mock.calls[0][0]).toBe(prismaMock);
    expect(runEscalationSweep.mock.calls[0][1]).toEqual(now);

    expect(complete).toHaveBeenCalledWith({
      processed: 3,
      reaped: 1,
      escalated: 2,
    });
    expect(fail).not.toHaveBeenCalled();
  });

  it("fails the lock and returns 500 when the job sweep throws", async () => {
    sweepJobs.mockRejectedValue(new Error("db down"));

    const { GET } = await import("@/app/api/cron/knox-tick/route");
    const res = await GET(createRequest("GET", URL_PATH, AUTH));
    expect(res.status).toBe(500);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(fail.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(complete).not.toHaveBeenCalled();
    expect(runEscalationSweep).not.toHaveBeenCalled();
  });

  it("fails the lock when the escalation sweep throws", async () => {
    runEscalationSweep.mockRejectedValue(new Error("teams down"));

    const { GET } = await import("@/app/api/cron/knox-tick/route");
    const res = await GET(createRequest("GET", URL_PATH, AUTH));
    expect(res.status).toBe(500);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
  });
});
