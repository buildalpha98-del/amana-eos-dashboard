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

  it("returns [] fast for empty input without calling fetch", async () => {
    process.env.VOYAGE_API_KEY = "test";
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { embedTexts } = await import("@/lib/embeddings");
    expect(await embedTexts([])).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
