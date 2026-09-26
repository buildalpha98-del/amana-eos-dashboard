import { describe, it, expect, vi, beforeEach } from "vitest";
const { after, warn } = vi.hoisted(() => ({ after: vi.fn((cb: () => Promise<void> | void) => cb()), warn: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() } }));
import { syncAfterResponse } from "@/lib/knowledge/hooks";

describe("syncAfterResponse", () => {
  beforeEach(() => vi.clearAllMocks());
  it("schedules the run via next/server after() and awaits it", async () => {
    const run = vi.fn(async () => "ok");
    syncAfterResponse("x", run);
    expect(after).toHaveBeenCalledTimes(1);
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
