import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

// Mute the structured logger but preserve helpers that withApiHandler uses.
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

const ORIGINAL_ENV = { ...process.env };

describe("/api/cron/induction-grace", () => {
  const complete = vi.fn().mockResolvedValue(undefined);
  const fail = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T02:00:00Z"));
    process.env.CRON_SECRET = "test-cron-secret";

    verifyCronSecret.mockReturnValue(null);
    acquireCronLock.mockResolvedValue({ acquired: true, complete, fail });

    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects requests without the cron secret", async () => {
    verifyCronSecret.mockReturnValue({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/cron/induction-grace/route");
    const res = await GET(createRequest("GET", "/api/cron/induction-grace"));
    expect(res.status).toBe(401);
    expect(acquireCronLock).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("no-ops when the lock is not acquired", async () => {
    acquireCronLock.mockResolvedValue({
      acquired: false,
      reason: "already ran today",
    });

    const { GET } = await import("@/app/api/cron/induction-grace/route");
    const res = await GET(
      createRequest("GET", "/api/cron/induction-grace", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("clears lapsed grace windows for in_training users", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 2 });

    const { GET } = await import("@/app/api/cron/induction-grace/route");
    const res = await GET(
      createRequest("GET", "/api/cron/induction-grace", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.graceExpired).toBe(2);

    // Only in_training users with a lapsed grace window are targeted.
    const call = prismaMock.user.updateMany.mock.calls[0][0];
    expect(call.where.inductionStatus).toBe("in_training");
    expect(call.where.inductionGraceUntil.lt).toBeInstanceOf(Date);
    // Grace date is nulled; status is left untouched.
    expect(call.data).toEqual({ inductionGraceUntil: null });
    expect(call.data.inductionStatus).toBeUndefined();

    await Promise.resolve();
    expect(complete).toHaveBeenCalledWith({ graceExpired: 2 });
  });
});
