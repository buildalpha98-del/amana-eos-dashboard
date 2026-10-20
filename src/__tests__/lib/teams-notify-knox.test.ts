import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { TEAMS_WEBHOOK_TIMEOUT_MS, sendTeamsNotification } from "@/lib/teams-notify";

const fetchMock = vi.fn();
const ENV_KEYS = ["TEAMS_WEBHOOK_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function sentCard() {
  const init = fetchMock.mock.calls[0][1] as { body: string };
  return JSON.parse(init.body);
}

describe("sendTeamsNotification — Knox extensions", () => {
  it("uses the webhookUrl override instead of TEAMS_WEBHOOK_URL", async () => {
    process.env.TEAMS_WEBHOOK_URL = "https://default.example/hook";
    const ok = await sendTeamsNotification({
      title: "t",
      body: "b",
      webhookUrl: "https://knox.example/hook",
    });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://knox.example/hook");
  });

  it("works with only a webhookUrl override (no env var set)", async () => {
    delete process.env.TEAMS_WEBHOOK_URL;
    const ok = await sendTeamsNotification({ title: "t", body: "b", webhookUrl: "https://knox.example/hook" });
    expect(ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://knox.example/hook");
  });

  it("falls back to TEAMS_WEBHOOK_URL when no override is given, and returns false when neither is set", async () => {
    process.env.TEAMS_WEBHOOK_URL = "https://default.example/hook";
    await sendTeamsNotification({ title: "t", body: "b" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://default.example/hook");

    delete process.env.TEAMS_WEBHOOK_URL;
    fetchMock.mockClear();
    expect(await sendTeamsNotification({ title: "t", body: "b" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds a <at> TextBlock and a msteams mention entity per mention", async () => {
    process.env.TEAMS_WEBHOOK_URL = "https://default.example/hook";
    await sendTeamsNotification({
      title: "t",
      body: "b",
      mentions: [
        { email: "owner1@amanaoshc.com.au", name: "Owner One" },
        { email: "owner2@amanaoshc.com.au", name: "Owner Two" },
      ],
    });
    const content = sentCard().attachments[0].content;
    const texts = content.body.filter((b: { type: string }) => b.type === "TextBlock").map((b: { text: string }) => b.text);
    expect(texts).toContain("<at>Owner One</at>");
    expect(texts).toContain("<at>Owner Two</at>");
    expect(content.msteams.width).toBe("Full");
    expect(content.msteams.entities).toHaveLength(2);
    expect(content.msteams.entities[0]).toEqual({
      type: "mention",
      text: "<at>Owner One</at>",
      mentioned: { id: "owner1@amanaoshc.com.au", name: "Owner One" },
    });
  });

  it("leaves the card untouched when there are no mentions (existing callers unchanged)", async () => {
    process.env.TEAMS_WEBHOOK_URL = "https://default.example/hook";
    await sendTeamsNotification({ title: "t", body: "b" });
    const content = sentCard().attachments[0].content;
    expect(content.msteams).toEqual({ width: "Full" });
    expect(content.body).toHaveLength(2);
  });
});

describe("sendTeamsNotification — timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts a webhook that never answers after 10 s and reports false", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = init.signal;
          init.signal.addEventListener("abort", () => reject(init.signal.reason));
        }),
    );
    const sent = sendTeamsNotification({ title: "t", body: "b", webhookUrl: "https://knox.example/hook" });
    await vi.advanceTimersByTimeAsync(TEAMS_WEBHOOK_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await sent).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(TEAMS_WEBHOOK_TIMEOUT_MS).toBe(10_000);
  });

  it("a prompt answer clears the timer", async () => {
    vi.useFakeTimers();
    expect(await sendTeamsNotification({ title: "t", body: "b", webhookUrl: "https://knox.example/hook" })).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
