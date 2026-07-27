/**
 * Regression tests for the 2026-07-27 outage.
 *
 * `checkRateLimit` called `upstash.limit()` with no error handling. When
 * Upstash started erroring, the rejection propagated through withApiAuth
 * and every authenticated API route returned 500 — the dashboard
 * error-boundaried and looked like all data had been deleted.
 *
 * The rate limiter must degrade to the in-memory limiter instead of
 * taking the application down with it.
 *
 * NOTE: this lives in its own file (rather than rate-limit.test.ts)
 * because the module caches its Redis client and Ratelimit instances at
 * module scope, and the sibling suite deliberately unsets the Upstash env
 * vars to exercise the in-memory path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Upstash must look CONFIGURED so the Redis branch is taken.
process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

const limitMock = vi.fn();
const keysMock = vi.fn();

// NOTE: these are invoked with `new`, so the implementations must be
// ordinary functions — arrow functions are not constructors.
vi.mock("@upstash/ratelimit", () => {
  const Ratelimit = vi.fn(function () {
    return { limit: limitMock };
  }) as unknown as { slidingWindow: ReturnType<typeof vi.fn> };
  Ratelimit.slidingWindow = vi.fn(() => "sliding-window");
  return { Ratelimit };
});

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(function () {
    return { keys: keysMock, del: vi.fn() };
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

describe("checkRateLimit — Upstash failover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not throw when Upstash rejects", async () => {
    limitMock.mockRejectedValue(new Error("Upstash unavailable"));

    await expect(
      checkRateLimit("failover-no-throw", 5, 60_000),
    ).resolves.toBeDefined();
  });

  it("falls back to the in-memory limiter and allows the request", async () => {
    limitMock.mockRejectedValue(new Error("Upstash unavailable"));

    const result = await checkRateLimit("failover-allows", 5, 60_000);

    // Must not block the caller — a Redis outage cannot take the app down.
    expect(result.limited).toBe(false);
    // In-memory counter engaged: 5 max, 1 consumed.
    expect(result.remaining).toBe(4);
  });

  it("still enforces a limit while Upstash is down (not fully open)", async () => {
    limitMock.mockRejectedValue(new Error("Upstash unavailable"));

    const key = "failover-still-limits";
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(key, 3, 60_000);
    }
    const fourth = await checkRateLimit(key, 3, 60_000);

    expect(fourth.limited).toBe(true);
  });

  it("logs the Upstash failure so the outage is visible", async () => {
    limitMock.mockRejectedValue(new Error("Upstash unavailable"));

    await checkRateLimit("failover-logs", 5, 60_000);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Upstash unavailable"),
      expect.objectContaining({ key: "failover-logs" }),
    );
  });

  it("uses the real Upstash result when Redis is healthy", async () => {
    limitMock.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 30_000,
    });

    const result = await checkRateLimit("healthy-path", 5, 60_000);

    expect(result.limited).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("resetRateLimit — Upstash failover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not throw when Upstash rejects (would otherwise block login)", async () => {
    keysMock.mockRejectedValue(new Error("Upstash unavailable"));

    await expect(resetRateLimit("login:someone@example.com")).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
