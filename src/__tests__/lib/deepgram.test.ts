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

  it("blocks transcription before sending a URL or any audio", async () => {
    await expect(requestTranscription({ audioUrl: "https://private.example/recording", callbackUrl: "https://example.test/callback" })).rejects.toMatchObject({ status: 403 });
    expect(fetch).not.toHaveBeenCalled();
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
