/**
 * Tests for the Employment Hero Payroll client.
 *
 * Focuses on the pieces that can break silently:
 *   - HTTP Basic header format (key + ':x' base64-encoded)
 *   - Configuration guard (throws when env vars missing)
 *   - 429 retry-after handling
 *   - Non-2xx error surface (EhPayrollError with status + body)
 *
 * Doesn't hit the real EH API — uses a `fetch` stub. The integration
 * test for the live key lives outside the codebase (curl smoke test
 * documented in the connect-once memory note).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.EH_PAYROLL_API_KEY = "test-key-abc";
  process.env.EH_PAYROLL_BUSINESS_ID = "999999";
  process.env.EH_PAYROLL_API_BASE = "https://api.test";
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("eh-payroll: configuration guard", () => {
  it("isConfigured returns false when API key is missing", async () => {
    delete process.env.EH_PAYROLL_API_KEY;
    const { isConfigured } = await import("@/lib/eh-payroll");
    expect(isConfigured()).toBe(false);
  });

  it("isConfigured returns false when business id is missing", async () => {
    delete process.env.EH_PAYROLL_BUSINESS_ID;
    const { isConfigured } = await import("@/lib/eh-payroll");
    expect(isConfigured()).toBe(false);
  });

  it("isConfigured returns true when both are set", async () => {
    const { isConfigured } = await import("@/lib/eh-payroll");
    expect(isConfigured()).toBe(true);
  });

  it("listEmployees throws a configured-error when key is missing", async () => {
    delete process.env.EH_PAYROLL_API_KEY;
    const { listEmployees, EhPayrollError } = await import("@/lib/eh-payroll");
    await expect(listEmployees()).rejects.toBeInstanceOf(EhPayrollError);
  });
});

describe("eh-payroll: HTTP Basic header", () => {
  it("base64-encodes key + ':x' in the Authorization header", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    const { listEmployees } = await import("@/lib/eh-payroll");
    await listEmployees();

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.test/api/v2/business/999999/employee");
    const headers = (init as RequestInit).headers as Record<string, string>;
    // "test-key-abc:x" base64 = "dGVzdC1rZXktYWJjOng="
    expect(headers.Authorization).toBe("Basic dGVzdC1rZXktYWJjOng=");
    expect(headers.Accept).toBe("application/json");
  });
});

describe("eh-payroll: 429 retry", () => {
  it("retries once on 429 honouring Retry-After (capped)", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      );

    const { listEmployees } = await import("@/lib/eh-payroll");
    const result = await listEmployees();
    expect(result).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("surfaces EhPayrollError when the retry also fails", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "still 429" }), { status: 429 }),
      );

    const { listEmployees, EhPayrollError } = await import("@/lib/eh-payroll");
    await expect(listEmployees()).rejects.toBeInstanceOf(EhPayrollError);
  });
});

describe("eh-payroll: error surface", () => {
  it("throws EhPayrollError with status + body on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
      }),
    );

    const { listEmployees, EhPayrollError } = await import("@/lib/eh-payroll");
    try {
      await listEmployees();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EhPayrollError);
      const e = err as InstanceType<typeof EhPayrollError>;
      expect(e.status).toBe(401);
      expect(e.body).toEqual({ message: "Unauthorized" });
    }
  });
});

describe("eh-payroll: listEmployees response shaping", () => {
  it("trims the response to our subset of fields", async () => {
    const ehResponse = [
      {
        id: 1,
        firstName: "Alice",
        surname: "Smith",
        email: "alice@amana.au",
        status: "Active",
        startDate: "2024-01-15T00:00:00",
        externalId: "ext-1",
        // Fields we deliberately do NOT pull through:
        bankAccount1_BSB: "06-2000",
        bankAccount1_AccountNumber: "12345678",
        contractorABN: "12 345 678 901",
        dateOfBirth: "1990-01-01T00:00:00",
      },
    ];
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(ehResponse), { status: 200 }),
    );

    const { listEmployees } = await import("@/lib/eh-payroll");
    const out = await listEmployees();
    expect(out).toEqual([
      {
        id: 1,
        firstName: "Alice",
        surname: "Smith",
        email: "alice@amana.au",
        status: "Active",
        startDate: "2024-01-15T00:00:00",
        externalId: "ext-1",
      },
    ]);
    // Bank + ABN must be absent — we never want them in our memory space.
    const keys = Object.keys(out[0]);
    expect(keys).not.toContain("bankAccount1_BSB");
    expect(keys).not.toContain("contractorABN");
    expect(keys).not.toContain("dateOfBirth");
  });
});
