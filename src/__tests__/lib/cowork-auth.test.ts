import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock rate-limit before importing module under test
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 9, resetIn: 900000 }),
  ),
}));

import { authenticateCowork, setVersionHeaders } from "@/app/api/_lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

function makeRequest(token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("x-forwarded-for", "1.2.3.4");
  return new NextRequest("https://example.com/api/cowork/test", { headers });
}

describe("authenticateCowork", () => {
  const ORIGINAL_KEY = process.env.COWORK_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COWORK_API_KEY = "test-cowork-key";
  });

  afterAll(() => {
    process.env.COWORK_API_KEY = ORIGINAL_KEY;
  });

  it("returns null (success) with valid token", async () => {
    const result = await authenticateCowork(makeRequest("test-cowork-key"));
    expect(result).toBeNull();
  });

  it("returns 401 with no Authorization header", async () => {
    const result = await authenticateCowork(makeRequest());
    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(result!.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with wrong token", async () => {
    const result = await authenticateCowork(makeRequest("wrong-key"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      limited: true,
      remaining: 0,
      resetIn: 900000,
    } as ReturnType<typeof checkRateLimit> extends Promise<infer T> ? T : never);

    const result = await authenticateCowork(makeRequest("test-cowork-key"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("rate limits by IP from x-forwarded-for", async () => {
    await authenticateCowork(makeRequest("test-cowork-key"));
    expect(checkRateLimit).toHaveBeenCalledWith(
      "cowork-auth:1.2.3.4",
      10,
      15 * 60 * 1000,
    );
  });
});

describe("setVersionHeaders", () => {
  it("sets X-API-Version header", () => {
    const res = NextResponse.json({ ok: true });
    setVersionHeaders(res, 2);
    expect(res.headers.get("X-API-Version")).toBe("2");
  });

  it("defaults to version 1", () => {
    const res = NextResponse.json({ ok: true });
    setVersionHeaders(res);
    expect(res.headers.get("X-API-Version")).toBe("1");
  });

  it("sets deprecation headers when deprecated", () => {
    const res = NextResponse.json({ ok: true });
    setVersionHeaders(res, 1, { deprecated: true });
    expect(res.headers.get("X-API-Deprecated")).toBe("true");
    expect(res.headers.get("Sunset")).toBeTruthy();
  });

  it("does not set deprecation headers by default", () => {
    const res = NextResponse.json({ ok: true });
    setVersionHeaders(res, 2);
    expect(res.headers.get("X-API-Deprecated")).toBeNull();
    expect(res.headers.get("Sunset")).toBeNull();
  });

  it("uses custom sunset date when provided", () => {
    const res = NextResponse.json({ ok: true });
    const sunsetDate = "Sat, 01 Jan 2027 00:00:00 GMT";
    setVersionHeaders(res, 1, { deprecated: true, sunsetDate });
    expect(res.headers.get("Sunset")).toBe(sunsetDate);
  });

  it("returns the same response object for chaining", () => {
    const res = NextResponse.json({ ok: true });
    const returned = setVersionHeaders(res, 1);
    expect(returned).toBe(res);
  });
});
