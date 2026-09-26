import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("embeddings", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.resetModules();
    delete process.env.VOYAGE_API_KEY;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("reports unconfigured and returns null without a key", async () => {
    const { embedTexts, isEmbeddingsConfigured } = await import("@/lib/embeddings");
    expect(isEmbeddingsConfigured()).toBe(false);
    expect(await embedTexts(["hello"])).toBeNull();
  });

  it("batches at 128 and preserves order", async () => {
    process.env.VOYAGE_API_KEY = "test";
    const calls: number[] = [];
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { input: string[] };
      calls.push(body.input.length);
      return new Response(
        JSON.stringify({
          data: body.input.map((_t, i) => ({ index: i, embedding: [i] })),
          usage: { total_tokens: body.input.length },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { embedTexts, embedTextsWithUsage } = await import("@/lib/embeddings");
    const texts = Array.from({ length: 200 }, (_, i) => `t${i}`);
    const out = await embedTexts(texts);
    expect(calls).toEqual([128, 72]);
    expect(out?.length).toBe(200);
    expect(out?.[129]).toEqual([1]); // second batch, index 1

    const withUsage = await embedTextsWithUsage(texts);
    expect(withUsage?.usage.totalTokens).toBe(200);
  });

  it("returns null (not throw) after retries on a 5xx", async () => {
    process.env.VOYAGE_API_KEY = "test";
    global.fetch = vi.fn(async () => new Response("boom", { status: 503 })) as unknown as typeof fetch;
    const { embedTexts } = await import("@/lib/embeddings");
    expect(await embedTexts(["x"], { retries: 1, retryDelayMs: 0 })).toBeNull();
  });

  it("bounds every Voyage request with a 30s AbortSignal timeout", async () => {
    process.env.VOYAGE_API_KEY = "test";
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    let seenSignal: unknown;
    global.fetch = vi.fn(async (_url, init) => {
      seenSignal = (init as RequestInit).signal;
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }], usage: { total_tokens: 1 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const { embedTexts } = await import("@/lib/embeddings");
    expect(await embedTexts(["x"])).toEqual([[1]]);
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    timeoutSpy.mockRestore();
  });

  it("treats a timed-out request like any failed attempt: retries, then null (never throws)", async () => {
    process.env.VOYAGE_API_KEY = "test";
    const fetchSpy = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { embedTexts } = await import("@/lib/embeddings");
    expect(await embedTexts(["x"], { retries: 1, retryDelayMs: 0 })).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns [] fast for empty input without calling fetch", async () => {
    process.env.VOYAGE_API_KEY = "test";
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { embedTexts } = await import("@/lib/embeddings");
    expect(await embedTexts([])).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
