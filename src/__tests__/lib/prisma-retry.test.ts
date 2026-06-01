/**
 * Tests for `withDbRetry` — the Neon E57P01 retry-once wrapper.
 *
 * The contract we lock down:
 *   1. Success on first call returns the value, no retry.
 *   2. Recognised stale-connection error → $disconnect → retry → if
 *      retry succeeds, return its value.
 *   3. Recognised stale-connection error twice in a row → throw the
 *      second error (we don't infinite-loop).
 *   4. Non-recognised error → throw immediately, no retry, no
 *      $disconnect call.
 *   5. Each known signature triggers retry (57P01, "Connection
 *      terminated unexpectedly", "Closed", "terminating connection
 *      due to administrator command").
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const disconnectMock = vi.fn(() => Promise.resolve());
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $disconnect: () => disconnectMock(),
  },
}));

import { withDbRetry } from "@/lib/prisma-retry";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withDbRetry — happy path", () => {
  it("returns the value on first-try success, no retry, no disconnect", async () => {
    const fn = vi.fn(() => Promise.resolve(42));
    const out = await withDbRetry(fn);
    expect(out).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(disconnectMock).not.toHaveBeenCalled();
  });
});

describe("withDbRetry — recognised stale-connection signatures", () => {
  const signatures = [
    "Error in PostgreSQL connection: code 57P01",
    "Connection terminated unexpectedly",
    "Closed",
    "FATAL: terminating connection due to administrator command",
  ];
  for (const sig of signatures) {
    it(`retries once on "${sig.slice(0, 50)}…"`, async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error(sig))
        .mockResolvedValueOnce("ok");
      const out = await withDbRetry(fn);
      expect(out).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  }

  it("re-throws when both attempts fail with stale signature", async () => {
    const err = new Error("57P01 connection died");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withDbRetry(fn)).rejects.toThrow(err);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("survives a $disconnect that itself throws", async () => {
    // $disconnect failing shouldn't prevent the retry — the next
    // Prisma call recreates the connection regardless.
    disconnectMock.mockRejectedValueOnce(new Error("disconnect blew up"));
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("57P01 stale"))
      .mockResolvedValueOnce("recovered");
    const out = await withDbRetry(fn);
    expect(out).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("withDbRetry — non-stale errors", () => {
  it("re-throws immediately on an unrelated error, no disconnect, no retry", async () => {
    const err = new Error("Unique constraint failed");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withDbRetry(fn)).rejects.toThrow(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it("treats null/undefined as not-stale (no retry)", async () => {
    const fn = vi.fn(() => Promise.reject(null));
    await expect(withDbRetry(fn)).rejects.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it("handles string-thrown values (not Error instances)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce("57P01 string-thrown")
      .mockResolvedValueOnce("recovered");
    const out = await withDbRetry(fn);
    expect(out).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
