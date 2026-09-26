import { describe, it, expect, vi, beforeEach } from "vitest";
const { runAfter, warn } = vi.hoisted(() => ({
  runAfter: vi.fn((cb: () => Promise<void> | void) => cb()),
  warn: vi.fn(),
}));
vi.mock("@/lib/run-after", () => ({ runAfter }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() } }));
import { syncAfterResponse } from "@/lib/knowledge/hooks";

describe("syncAfterResponse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("schedules the run via runAfter() and awaits it", async () => {
    const run = vi.fn(async () => "ok");
    syncAfterResponse("x", run);
    expect(runAfter).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("logs a rejected run instead of throwing", async () => {
    const run = vi.fn(async () => { throw new Error("boom"); });
    expect(() => syncAfterResponse("policy_upload", run)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledWith("Knowledge: sync failed", expect.objectContaining({ adapter: "policy_upload" }));
  });
});

/**
 * `runAfter` (src/lib/run-after.ts) already swallows a synchronous
 * `after()` throw internally — outside a request scope (scripts, this
 * test env) it catches the throw and falls back to running the task
 * inline. So there is no real path where `runAfter` itself propagates a
 * throw to `syncAfterResponse`; mocking `runAfter` to throw would only
 * test a scenario runAfter's own contract rules out. Instead this
 * exercises the REAL runAfter (via vi.doUnmock) with a real `after()`
 * that throws synchronously — the actual "no request scope" case — and
 * confirms syncAfterResponse still doesn't throw and still logs a
 * rejected run via the inline fallback.
 */
describe("syncAfterResponse — no request scope (real runAfter)", () => {
  it("still logs instead of throwing when the underlying scheduler throws synchronously", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/run-after");
    vi.doMock("next/server", async (importOriginal) => ({
      ...(await importOriginal<object>()),
      after: () => {
        throw new Error("`after` was called outside a request scope");
      },
    }));
    const warnSpy = vi.fn();
    vi.doMock("@/lib/logger", () => ({
      logger: { info: vi.fn(), warn: warnSpy, error: vi.fn(), debug: vi.fn() },
    }));

    const { syncAfterResponse: realSyncAfterResponse } = await import("@/lib/knowledge/hooks");
    const run = vi.fn(async () => {
      throw new Error("boom");
    });

    expect(() => realSyncAfterResponse("lms_module", run)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(run).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "Knowledge: sync failed",
      expect.objectContaining({ adapter: "lms_module" }),
    );
  });
});
