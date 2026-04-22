import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendSlackFeedback } from "@/lib/slack-webhook";
import { logger } from "@/lib/logger";

describe("sendSlackFeedback", () => {
  const originalEnv = process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL;
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (globalThis as Record<string, unknown>).fetch = fetchSpy;
    fetchSpy.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalEnv === undefined) delete process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL;
    else process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = originalEnv;
  });

  it("is a no-op when env var absent", async () => {
    delete process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL;
    await sendSlackFeedback({ id: "fb-1", authorName: "Jayden", role: "owner", category: "bug", message: "Broken" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs to the webhook URL with formatted payload", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    await sendSlackFeedback({ id: "fb-1", authorName: "Jayden", role: "owner", category: "bug", message: "It broke" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/xxx");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.text).toContain("bug");
    expect(body.text).toContain("Jayden");
    expect(body.text).toContain("It broke");
    expect(body.text).toContain("/admin/feedback");
  });

  it("truncates very long messages to 100 chars with ellipsis", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    await sendSlackFeedback({
      id: "fb-1",
      authorName: "Jayden",
      role: "owner",
      category: "bug",
      message: "x".repeat(250),
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain("…");
    expect(body.text).not.toContain("x".repeat(101));
  });

  it("retries once on failure then logs and swallows", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockRejectedValue(new Error("boom"));

    await sendSlackFeedback({ id: "fb-1", authorName: "J", role: "admin", category: "bug", message: "m" });

    expect(fetchSpy).toHaveBeenCalledTimes(2); // initial + 1 retry
    expect(logger.warn).toHaveBeenCalledWith(
      "Slack feedback webhook failed",
      expect.any(Object),
    );
  });

  it("retries on HTTP error (non-2xx) then logs", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await sendSlackFeedback({ id: "fb-1", authorName: "J", role: "admin", category: "bug", message: "m" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      "Slack feedback webhook failed",
      expect.any(Object),
    );
  });

  it("aborts after 3s timeout and logs", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    // Mock must honor the abort signal: reject with AbortError when controller.abort() fires
    fetchSpy.mockImplementation((_url, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }),
    );

    const promise = sendSlackFeedback({ id: "fb-1", authorName: "J", role: "admin", category: "bug", message: "m" });
    await vi.advanceTimersByTimeAsync(3100); // first attempt
    await vi.advanceTimersByTimeAsync(3100); // retry
    await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2); // initial + retry
    expect(logger.warn).toHaveBeenCalledWith(
      "Slack feedback webhook failed",
      expect.any(Object),
    );
  });

  it("passes AbortSignal to fetch", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    await sendSlackFeedback({ id: "fb-1", authorName: "J", role: "admin", category: "bug", message: "m" });

    const init = fetchSpy.mock.calls[0][1];
    expect(init.signal).toBeDefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not throw on fetch error (fire-and-forget)", async () => {
    process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/xxx";
    fetchSpy.mockRejectedValue(new Error("boom"));
    await expect(
      sendSlackFeedback({ id: "fb-1", authorName: "J", role: "admin", category: "bug", message: "m" }),
    ).resolves.toBeUndefined();
  });
});
