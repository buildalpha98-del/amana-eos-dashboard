import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { sendSms, normaliseAuMobile } from "@/lib/sms";

describe("normaliseAuMobile", () => {
  it("accepts E.164 +61 mobile", () => {
    expect(normaliseAuMobile("+61412345678")).toBe("+61412345678");
  });

  it("accepts local 04 mobile", () => {
    expect(normaliseAuMobile("0412345678")).toBe("+61412345678");
  });

  it("strips whitespace and brackets", () => {
    expect(normaliseAuMobile("(04) 1234-5678")).toBe("+61412345678");
  });

  it("accepts 9-digit '4xxxxxxxx'", () => {
    expect(normaliseAuMobile("412345678")).toBe("+61412345678");
  });

  it("rejects landline (02 prefix)", () => {
    expect(normaliseAuMobile("0298765432")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(normaliseAuMobile("")).toBeNull();
  });

  it("rejects E.164 with wrong length", () => {
    expect(normaliseAuMobile("+6141234567")).toBeNull();
  });

  it("rejects malformed garbage", () => {
    expect(normaliseAuMobile("not-a-phone")).toBeNull();
  });
});

describe("sendSms", () => {
  const ORIGINAL = process.env.SMS_PROVIDER;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.SMS_PROVIDER;
    } else {
      process.env.SMS_PROVIDER = ORIGINAL;
    }
  });

  it("returns not_configured when no provider env set", async () => {
    delete process.env.SMS_PROVIDER;
    const result = await sendSms({
      to: { number: "0412345678" },
      body: "test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_configured");
  });

  it("returns all_invalid when every recipient is unparseable", async () => {
    delete process.env.SMS_PROVIDER;
    const result = await sendSms({
      to: [{ number: "garbage" }, { number: "" }],
      body: "test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("all_invalid");
  });

  it("filters invalid numbers but keeps valid ones (would dispatch when configured)", async () => {
    // No provider configured — but the validation step runs first; with
    // ≥1 valid recipient it falls through to provider lookup, then warns.
    delete process.env.SMS_PROVIDER;
    const result = await sendSms({
      to: [{ number: "garbage" }, { number: "0412345678" }],
      body: "test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_configured");
  });
});
