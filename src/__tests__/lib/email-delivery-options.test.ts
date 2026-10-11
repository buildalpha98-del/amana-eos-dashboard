import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";
import { getSuppressedEmails } from "@/lib/email-suppression";
import { logger } from "@/lib/logger";

vi.mock("@/lib/email-suppression", () => ({ getSuppressedEmails: vi.fn(async () => new Set<string>()) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const payload = { from: "Sender <sender@example.test>", to: ["recipient@example.test"], subject: "Synthetic invoice", html: "<p>Synthetic</p>" };
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "re_synthetic_no_network");
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getSuppressedEmails).mockResolvedValue(new Set());
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "message-synthetic" }), { status: 200 }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("recoverable send transport through the installed Resend SDK", () => {
  it("forwards the stable key and abort signal to fetch with a stable payload", async () => {
    const signal = AbortSignal.timeout(1000);
    expect(await sendEmail(payload, { idempotencyKey: "statement-issued/synthetic", signal })).toMatchObject({ messageId: "message-synthetic", sent: payload.to });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options?.signal).toBe(signal);
    expect(new Headers(options?.headers).get("Idempotency-Key")).toBe("statement-issued/synthetic");
    expect(JSON.parse(options?.body as string)).toEqual(payload);
  });
  it("does not report success without a provider message ID", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendEmail(payload)).toMatchObject({ sent: [], failed: { name: "application_error" } });
  });
  it("preserves provider rejection details for retry classification", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: "rate_limit_exceeded", statusCode: 429, message: "Try later" }), { status: 429 }));
    expect(await sendEmail(payload)).toMatchObject({ sent: [], failed: { name: "rate_limit_exceeded", statusCode: 429 } });
  });
  it("keeps suppression enforcement in front of the provider", async () => {
    vi.mocked(getSuppressedEmails).mockResolvedValue(new Set(payload.to));
    expect(await sendEmail(payload, { idempotencyKey: "statement-issued/synthetic" })).toMatchObject({ sent: [], suppressed: payload.to });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("omits recipients, subjects and provider response text from recoverable-send logs", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: "validation_error", statusCode: 422, message: payload.to[0] }), { status: 422 }));
    await sendEmail(payload, { idempotencyKey: "statement-issued/synthetic" });
    expect(logger.error).toHaveBeenCalledWith("Email rejected by provider", { statusCode: 422 });
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(payload.to[0]);
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(payload.subject);
  });
});
