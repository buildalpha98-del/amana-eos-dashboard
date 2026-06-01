import { describe, it, expect, beforeEach, vi } from "vitest";

// `vi.mock` is hoisted above top-level `const`s, so we use `vi.hoisted` so the
// factory can reference our spy without TDZ errors.
const { disconnectMock } = vi.hoisted(() => ({
  disconnectMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $disconnect: disconnectMock },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { withDbRetry } from "@/lib/prisma-retry";

function makeStaleError(): Error {
  // Mirrors what Prisma surfaces when Neon's pooler reaps an idle connection:
  //   "Error in PostgreSQL connection: ... severity: FATAL, code: SqlState(E57P01),
  //    message: terminating connection due to administrator command ..."
  return new Error(
    "Error in PostgreSQL connection: code: SqlState(E57P01), message: terminating connection due to administrator command",
  );
}

describe("withDbRetry", () => {
  beforeEach(() => {
    disconnectMock.mockClear();
  });

  it("returns the result without retrying on first-try success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withDbRetry(fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it("retries once on E57P01 and returns the second result", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeStaleError())
      .mockResolvedValueOnce("recovered");

    const result = await withDbRetry(fn);

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("throws when E57P01 happens twice in a row (no second retry)", async () => {
    const fn = vi.fn().mockRejectedValue(makeStaleError());

    await expect(withDbRetry(fn)).rejects.toThrow(/57P01/);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry on errors unrelated to stale connections", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Unique constraint violation"));

    await expect(withDbRetry(fn)).rejects.toThrow("Unique constraint violation");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(disconnectMock).not.toHaveBeenCalled();
  });
});
