/**
 * Tests for the EH Payroll webhook signature verification.
 *
 * Critical contract:
 *   - No secret env var → fail closed
 *   - No signature header → fail
 *   - Wrong signature → fail
 *   - Correct HMAC over the raw body → pass
 *   - Constant-time comparison (we can't easily test timing, but the
 *     test ensures the code path executes)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyEhSignature,
  extractEventId,
  extractEventType,
} from "@/lib/eh-payroll-webhook";

const SECRET = "test-secret-do-not-use-in-prod";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

beforeEach(() => {
  process.env.EH_PAYROLL_WEBHOOK_SECRET = SECRET;
});

describe("verifyEhSignature", () => {
  it("rejects when secret env var is unset", () => {
    delete process.env.EH_PAYROLL_WEBHOOK_SECRET;
    const res = verifyEhSignature(
      "{}",
      new Headers({ "x-yourpayroll-signature": "abc" }),
    );
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("not configured");
  });

  it("rejects when no signature header present", () => {
    const res = verifyEhSignature("{}", new Headers({}));
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("No signature header");
  });

  it("rejects when signature doesn't match", () => {
    const body = '{"event":"test"}';
    const wrong = "0".repeat(64);
    const res = verifyEhSignature(
      body,
      new Headers({ "x-yourpayroll-signature": wrong }),
    );
    expect(res.valid).toBe(false);
  });

  it("accepts a valid signature", () => {
    const body = '{"event":"leave_request.updated"}';
    const sig = sign(body);
    const res = verifyEhSignature(
      body,
      new Headers({ "x-yourpayroll-signature": sig }),
    );
    expect(res.valid).toBe(true);
  });

  it("accepts the sha256= prefixed form", () => {
    const body = '{"event":"test"}';
    const sig = `sha256=${sign(body)}`;
    const res = verifyEhSignature(
      body,
      new Headers({ "x-yourpayroll-signature": sig }),
    );
    expect(res.valid).toBe(true);
  });

  it("accepts alternative signature headers (x-keypay-signature)", () => {
    const body = '{"event":"test"}';
    const sig = sign(body);
    const res = verifyEhSignature(
      body,
      new Headers({ "x-keypay-signature": sig }),
    );
    expect(res.valid).toBe(true);
  });

  it("rejects signature signed with a different secret", () => {
    const body = '{"event":"test"}';
    const sig = sign(body, "different-secret");
    const res = verifyEhSignature(
      body,
      new Headers({ "x-yourpayroll-signature": sig }),
    );
    expect(res.valid).toBe(false);
  });
});

describe("extractEventId", () => {
  it("returns event_id when present", () => {
    expect(extractEventId({ event_id: "abc-123" })).toBe("abc-123");
  });
  it("returns eventId (camelCase) when present", () => {
    expect(extractEventId({ eventId: "xyz" })).toBe("xyz");
  });
  it("returns id when no event_id/eventId", () => {
    expect(extractEventId({ id: "fallback" })).toBe("fallback");
  });
  it("returns null on empty / non-object", () => {
    expect(extractEventId(null)).toBeNull();
    expect(extractEventId("string")).toBeNull();
    expect(extractEventId({})).toBeNull();
  });
});

describe("extractEventType", () => {
  it("returns event_type when present", () => {
    expect(extractEventType({ event_type: "leave_request.updated" })).toBe(
      "leave_request.updated",
    );
  });
  it("returns eventType (camelCase)", () => {
    expect(extractEventType({ eventType: "expense.created" })).toBe(
      "expense.created",
    );
  });
  it("returns type when no event_type/eventType", () => {
    expect(extractEventType({ type: "fallback" })).toBe("fallback");
  });
  it("returns 'unknown' for empty / non-object", () => {
    expect(extractEventType(null)).toBe("unknown");
    expect(extractEventType({})).toBe("unknown");
  });
});
