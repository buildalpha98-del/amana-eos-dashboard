/**
 * When the provider says no.
 *
 * The Resend SDK does NOT throw on an API error — it resolves with
 * `{ data: null, error }`. Every send site here destructured only
 * `data`, so an unverified sending domain, a rate limit or a blocked
 * recipient all looked exactly like success: the caller was told the
 * mail went, the ledger recorded a delivery, and nothing reached the
 * logs. A parent asking "why didn't I get the reset email" had nothing
 * to find.
 *
 * These pin the three properties that make that visible again.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// `vi.hoisted` because vi.mock factories are lifted above the file's
// own declarations — a plain const here is read before it exists.
const { sendMock, loggerMock } = vi.hoisted(() => {
  const logger: Record<string, unknown> = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  logger.withRequestId = () => logger;
  return { sendMock: vi.fn(), loggerMock: logger };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/email-suppression", () => ({
  getSuppressedEmails: vi.fn(() => Promise.resolve(new Set<string>())),
}));

import { sendEmail } from "@/lib/email";

const params = {
  to: "parent@example.com",
  subject: "Reset your password",
  html: "<p>link</p>",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "re_test";
});

describe("sendEmail — a rejected send is not a sent one", () => {
  it("reports nothing sent when the provider rejects", async () => {
    // The bug in one line: `sent` used to be the eligible list
    // regardless of what came back.
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Domain is not verified", name: "validation_error" },
    });

    const result = await sendEmail(params);
    expect(result.sent).toEqual([]);
  });

  it("surfaces the provider's reason", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Domain is not verified", name: "validation_error" },
    });

    const result = await sendEmail(params);
    expect(result.failed?.message).toBe("Domain is not verified");
  });

  it("logs the rejection, so it can be found afterwards", async () => {
    // Without this the failure exists nowhere at all — not in the
    // response, not in the ledger, not in the logs.
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Rate limit exceeded", name: "rate_limit_exceeded" },
    });

    await sendEmail(params);
    expect(loggerMock.error as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "Email rejected by provider",
      expect.objectContaining({ error: "Rate limit exceeded" }),
    );
  });

  it("does not throw — 80-odd callers send mail as a side effect", async () => {
    // Throwing would turn "the invite didn't send" into "creating the
    // user failed", which is the worse outcome for almost all of them.
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "nope", name: "application_error" },
    });

    await expect(sendEmail(params)).resolves.toBeDefined();
  });

  it("still reports success as success", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg-1" }, error: null });

    const result = await sendEmail(params);
    expect(result.sent).toEqual(["parent@example.com"]);
    expect(result.messageId).toBe("msg-1");
    expect(result.failed).toBeUndefined();
    expect(loggerMock.error as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

describe("sendEmail — suppression is still its own outcome", () => {
  it("keeps suppressed distinct from rejected", async () => {
    // They need different fixes — one is our list, one is theirs — so
    // collapsing them into "failed" would lose the diagnosis.
    const { getSuppressedEmails } = await import("@/lib/email-suppression");
    vi.mocked(getSuppressedEmails).mockResolvedValue(
      new Set(["parent@example.com"]),
    );

    const result = await sendEmail(params);
    expect(result.suppressed).toEqual(["parent@example.com"]);
    expect(result.failed).toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
