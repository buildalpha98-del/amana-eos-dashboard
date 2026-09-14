/**
 * Invite delivery reporting.
 *
 * These exist because of a real incident: a State Manager completed an
 * onboarding on 2026-09-14 and the new hire never received their login.
 * `sendEmail` reports suppression and provider rejection as RETURN VALUES
 * rather than throwing, and this helper used to `await` the call and
 * discard it, catching only throws. Every failure therefore looked exactly
 * like success — including to the admin, who was told the invite was sent.
 *
 * So the contract under test is: every non-delivery is reported as such.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const sendEmail = vi.fn();
const getResend = vi.fn();

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  getResend: () => getResend(),
}));

vi.mock("@/lib/email-templates", () => ({
  welcomeEmail: vi.fn(() =>
    Promise.resolve({ subject: "Welcome", html: "<p>hi</p>" }),
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendWelcomeInvite, inviteDelivered } from "@/lib/staff-invite";

const OPTS = { email: "amina@example.com", name: "Amina Yusuf", tempPassword: "abc123" };

describe("sendWelcomeInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResend.mockReturnValue({});
  });

  it("reports a delivered invite", async () => {
    sendEmail.mockResolvedValue({ sent: [OPTS.email], suppressed: [] });

    const result = await sendWelcomeInvite(OPTS);

    expect(result.status).toBe("sent");
    expect(inviteDelivered(result)).toBe(true);
  });

  it("reports a suppressed address rather than silently succeeding", async () => {
    // The likeliest real cause: the address bounced or unsubscribed once,
    // so every later send is dropped before it reaches the provider.
    sendEmail.mockResolvedValue({ sent: [], suppressed: [OPTS.email] });

    const result = await sendWelcomeInvite(OPTS);

    expect(result.status).toBe("suppressed");
    expect(inviteDelivered(result)).toBe(false);
    expect(result.detail).toMatch(/suppression/i);
  });

  it("reports a provider rejection", async () => {
    // Resend does NOT throw on an API error — it resolves with the error
    // in the payload, which is what made this invisible.
    sendEmail.mockResolvedValue({
      sent: [],
      suppressed: [],
      failed: { message: "The domain is not verified", name: "validation_error" },
    });

    const result = await sendWelcomeInvite(OPTS);

    expect(result.status).toBe("rejected");
    expect(result.detail).toBe("The domain is not verified");
  });

  it("reports an empty result rather than assuming success", async () => {
    // No send, no suppression, no error. Shouldn't happen — but returning
    // "sent" on an unknown outcome is how this class of bug starts.
    sendEmail.mockResolvedValue({ sent: [], suppressed: [] });

    const result = await sendWelcomeInvite(OPTS);

    expect(result.status).toBe("error");
    expect(inviteDelivered(result)).toBe(false);
  });

  it("reports a thrown error without rethrowing", async () => {
    // Never throws: the user account is already committed, and turning
    // "the invite didn't send" into "creating the user failed" is worse.
    sendEmail.mockRejectedValue(new Error("socket hang up"));

    const result = await sendWelcomeInvite(OPTS);

    expect(result.status).toBe("error");
    expect(result.detail).toBe("socket hang up");
  });

  it("reports a missing API key as not_configured in production", async () => {
    getResend.mockReturnValue(null);
    const prev = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");

    const result = await sendWelcomeInvite(OPTS);

    expect(result.status).toBe("not_configured");
    expect(sendEmail).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", prev ?? "test");
  });

  it("treats a missing API key outside production as a normal dev setup", async () => {
    getResend.mockReturnValue(null);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendWelcomeInvite(OPTS);

    // Local dev has no Resend key by design — flagging it as a delivery
    // failure would put a permanent red banner on every seeded account.
    expect(result.status).toBe("sent");
    logSpy.mockRestore();
  });
});
