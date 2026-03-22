import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Ensure Upstash env vars are NOT set so the in-memory fallback is used
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

// Mock Upstash modules to prevent any real connections
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(),
}));

// ── Imports (after env cleanup + mocks) ─────────────────────────

import {
  checkRateLimit,
  checkApiKeyRateLimit,
  resetRateLimit,
} from "@/lib/rate-limit";

// ── Tests ───────────────────────────────────────────────────────

describe("checkRateLimit (in-memory fallback)", () => {
  beforeEach(async () => {
    // Reset all rate limit state between tests by resetting known keys
    // We use unique keys per test to avoid interference, but also reset common ones
    await resetRateLimit("test-key");
    await resetRateLimit("test-key-a");
    await resetRateLimit("test-key-b");
    await resetRateLimit("test-remaining");
    await resetRateLimit("test-exceed");
    await resetRateLimit("test-window");
    await resetRateLimit("test-reset");
  });

  it("returns limited: false on first call", async () => {
    const result = await checkRateLimit("first-call-key", 5, 60_000);

    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(4); // 5 max - 1 used
    expect(result.resetIn).toBe(60_000);

    // Cleanup
    await resetRateLimit("first-call-key");
  });

  it("returns correct remaining count as calls are made", async () => {
    const key = "test-remaining";
    const maxAttempts = 5;

    const r1 = await checkRateLimit(key, maxAttempts, 60_000);
    expect(r1.remaining).toBe(4); // 5 - 1

    const r2 = await checkRateLimit(key, maxAttempts, 60_000);
    expect(r2.remaining).toBe(3); // 5 - 2

    const r3 = await checkRateLimit(key, maxAttempts, 60_000);
    expect(r3.remaining).toBe(2); // 5 - 3

    const r4 = await checkRateLimit(key, maxAttempts, 60_000);
    expect(r4.remaining).toBe(1); // 5 - 4

    const r5 = await checkRateLimit(key, maxAttempts, 60_000);
    expect(r5.remaining).toBe(0); // 5 - 5

    // All should not be limited yet (at exactly max)
    expect(r1.limited).toBe(false);
    expect(r2.limited).toBe(false);
    expect(r3.limited).toBe(false);
    expect(r4.limited).toBe(false);
    expect(r5.limited).toBe(false);
  });

  it("returns limited: true after exceeding max attempts", async () => {
    const key = "test-exceed";
    const maxAttempts = 3;

    // Use up all 3 attempts
    await checkRateLimit(key, maxAttempts, 60_000);
    await checkRateLimit(key, maxAttempts, 60_000);
    await checkRateLimit(key, maxAttempts, 60_000);

    // 4th call should be limited
    const result = await checkRateLimit(key, maxAttempts, 60_000);
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    vi.useFakeTimers();

    try {
      const key = "test-window";
      const maxAttempts = 2;
      const windowMs = 10_000; // 10 seconds

      // Exhaust the limit
      await checkRateLimit(key, maxAttempts, windowMs);
      await checkRateLimit(key, maxAttempts, windowMs);
      const limited = await checkRateLimit(key, maxAttempts, windowMs);
      expect(limited.limited).toBe(true);

      // Advance time past the window
      vi.advanceTimersByTime(windowMs + 1);

      // Should be allowed again
      const afterWindow = await checkRateLimit(key, maxAttempts, windowMs);
      expect(afterWindow.limited).toBe(false);
      expect(afterWindow.remaining).toBe(maxAttempts - 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("different keys don't interfere with each other", async () => {
    const keyA = "test-key-a";
    const keyB = "test-key-b";
    const maxAttempts = 2;

    // Exhaust keyA
    await checkRateLimit(keyA, maxAttempts, 60_000);
    await checkRateLimit(keyA, maxAttempts, 60_000);
    const limitedA = await checkRateLimit(keyA, maxAttempts, 60_000);
    expect(limitedA.limited).toBe(true);

    // keyB should still be fine
    const resultB = await checkRateLimit(keyB, maxAttempts, 60_000);
    expect(resultB.limited).toBe(false);
    expect(resultB.remaining).toBe(1);
  });
});

describe("resetRateLimit", () => {
  it("clears the counter for a key", async () => {
    const key = "test-reset";
    const maxAttempts = 2;

    // Use up all attempts
    await checkRateLimit(key, maxAttempts, 60_000);
    await checkRateLimit(key, maxAttempts, 60_000);
    const limited = await checkRateLimit(key, maxAttempts, 60_000);
    expect(limited.limited).toBe(true);

    // Reset
    await resetRateLimit(key);

    // Should be allowed again
    const afterReset = await checkRateLimit(key, maxAttempts, 60_000);
    expect(afterReset.limited).toBe(false);
    expect(afterReset.remaining).toBe(maxAttempts - 1);
  });
});

describe("checkApiKeyRateLimit (in-memory fallback)", () => {
  beforeEach(async () => {
    await resetRateLimit("apikey:test-api-key");
  });

  it("returns limited: false on first call", async () => {
    const result = await checkApiKeyRateLimit("test-api-key");

    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(99); // 100 max - 1 used
  });

  it("returns limited: true after 100 requests", async () => {
    const keyId = "test-api-key";

    // Make 100 calls (the max)
    for (let i = 0; i < 100; i++) {
      const r = await checkApiKeyRateLimit(keyId);
      expect(r.limited).toBe(false);
    }

    // 101st call should be limited
    const result = await checkApiKeyRateLimit(keyId);
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
  });
});
