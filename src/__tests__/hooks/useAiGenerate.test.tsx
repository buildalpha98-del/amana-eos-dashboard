// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

import { useAiGenerate } from "@/hooks/useAiGenerate";

const originalFetch = global.fetch;

function mockFetchOnce(response: Response | Promise<Response>) {
  global.fetch = vi.fn(() => Promise.resolve(response)) as typeof fetch;
}

function mockFetchSequence(responses: Array<Response | Error>) {
  const queue = [...responses];
  global.fetch = vi.fn(() => {
    const next = queue.shift();
    if (!next) throw new Error("fetch called more times than mocked");
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  }) as typeof fetch;
}

describe("useAiGenerate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns text on happy-path non-streaming request", async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({ text: "hello world", usage: { inputTokens: 10, outputTokens: 5 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { result } = renderHook(() => useAiGenerate());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.generate({ templateSlug: "reflection" });
    });
    expect(text).toBe("hello world");
    expect(result.current.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("retries on 5xx up to maxRetries", async () => {
    mockFetchSequence([
      new Response("server error", { status: 503 }),
      new Response("still erroring", { status: 503 }),
      new Response(
        JSON.stringify({ text: "recovered", usage: { inputTokens: 1, outputTokens: 1 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ]);

    const { result } = renderHook(() => useAiGenerate());
    let text: string | null = null;
    const p = act(async () => {
      text = await result.current.generate({ templateSlug: "reflection", maxRetries: 2 });
    });
    // advance fake timers past the backoffs (500ms then 1000ms)
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(text).toBe("recovered");
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it("surfaces error after retries exhausted", async () => {
    vi.useRealTimers();
    mockFetchSequence([
      new Response("boom", { status: 503 }),
      new Response("boom", { status: 503 }),
    ]);

    const { result } = renderHook(() => useAiGenerate());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.generate({ templateSlug: "reflection", maxRetries: 1 });
    });
    expect(text).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  }, 10000);

  it("calls onMalformed when validator fails and returns null", async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ text: "bad shape" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useAiGenerate());
    const onMalformed = vi.fn((t: string) => t.includes("expected prefix"));
    let text: string | null = null;
    await act(async () => {
      text = await result.current.generate({
        templateSlug: "reflection",
        onMalformed,
      });
    });
    expect(onMalformed).toHaveBeenCalledWith("bad shape");
    expect(text).toBeNull();
  });

  it("does not retry on 4xx errors", async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ error: "bad input" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    ]);

    const { result } = renderHook(() => useAiGenerate());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.generate({ templateSlug: "reflection", maxRetries: 2 });
    });
    expect(text).toBeNull();
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
