import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildDeepgramCallbackUrl,
  buildTranscriptText,
  extractRequestId,
  extractUtterances,
  requestTranscription,
} from "@/lib/deepgram";

const ORIGINAL_ENV = { ...process.env };

describe("requestTranscription", () => {
  beforeEach(() => {
    process.env.DEEPGRAM_API_KEY = "dg-test-key";
    process.env.DEEPGRAM_WEBHOOK_SECRET = "hook-secret";
    process.env.NEXTAUTH_URL = "https://example.test";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("POSTs the blob url with nova-3 + diarize + callback params", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ request_id: "req-123" }), { status: 200 }),
    );

    const result = await requestTranscription({
      audioUrl: "https://x.blob.vercel-storage.com/a.webm",
      callbackUrl: "https://example.test/api/webhooks/deepgram?secret=hook-secret",
    });

    expect(result.requestId).toBe("req-123");
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://api.deepgram.com/v1/listen");
    expect(parsed.searchParams.get("model")).toBe("nova-3");
    expect(parsed.searchParams.get("diarize")).toBe("true");
    expect(parsed.searchParams.get("utterances")).toBe("true");
    expect(parsed.searchParams.get("callback")).toContain("/api/webhooks/deepgram");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Token dg-test-key",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      url: "https://x.blob.vercel-storage.com/a.webm",
    });
  });

  it("throws with the response text on non-2xx", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("bad key", { status: 401 }),
    );
    await expect(
      requestTranscription({ audioUrl: "https://x", callbackUrl: "https://y" }),
    ).rejects.toThrow(/401/);
  });

  it("builds the callback URL from siteUrl + secret", () => {
    expect(buildDeepgramCallbackUrl()).toBe(
      "https://example.test/api/webhooks/deepgram?secret=hook-secret",
    );
  });
});

describe("extractUtterances / extractRequestId", () => {
  it("maps Deepgram's `transcript` field to text", () => {
    const utterances = extractUtterances({
      results: {
        utterances: [
          { speaker: 0, start: 0.5, end: 2, transcript: "Hello team" },
          { speaker: 1, start: 2.2, end: 4, transcript: "Morning" },
        ],
      },
    });
    expect(utterances).toEqual([
      { speaker: 0, start: 0.5, end: 2, text: "Hello team" },
      { speaker: 1, start: 2.2, end: 4, text: "Morning" },
    ]);
  });

  it("falls back to the channel transcript as a single speaker-0 utterance", () => {
    const utterances = extractUtterances({
      results: { channels: [{ alternatives: [{ transcript: "all in one" }] }] },
    });
    expect(utterances).toEqual([{ speaker: 0, start: 0, end: 0, text: "all in one" }]);
  });

  it("returns [] for a no-speech / failure payload", () => {
    expect(extractUtterances({ results: {} })).toEqual([]);
    expect(extractUtterances({})).toEqual([]);
  });

  it("reads request_id from metadata first, then top level", () => {
    expect(extractRequestId({ metadata: { request_id: "a" }, request_id: "b" })).toBe("a");
    expect(extractRequestId({ request_id: "b" })).toBe("b");
    expect(extractRequestId({})).toBeNull();
  });
});

describe("buildTranscriptText", () => {
  it("coalesces consecutive same-speaker utterances", () => {
    const text = buildTranscriptText([
      { speaker: 0, start: 0, end: 1, text: "First." },
      { speaker: 0, start: 1, end: 2, text: "Second." },
      { speaker: 1, start: 2, end: 3, text: "Reply." },
      { speaker: 0, start: 3, end: 4, text: "Back again." },
    ]);
    expect(text).toBe(
      "Speaker 0: First. Second.\nSpeaker 1: Reply.\nSpeaker 0: Back again.",
    );
  });
});
