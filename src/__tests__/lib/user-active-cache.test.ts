import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks (must be before imports) ─────────────────────────────

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ limited: false, remaining: 59, resetIn: 60000 }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
  generateRequestId: vi.fn(() => "test-req-id"),
}));

vi.mock("@/lib/role-permissions", () => ({
  hasFeature: vi.fn(() => true),
  hasMinRole: vi.fn(() => true),
}));

// ── Imports (after mocks) ──────────────────────────────────────

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { withApiAuth, _clearUserActiveCache } from "@/lib/server-auth";

// ── Helpers ────────────────────────────────────────────────────

const mockReq = () =>
  new NextRequest("http://localhost/api/test", { method: "GET" });

const activeSession = {
  user: { id: "user-cache-1", role: "owner", email: "test@test.com" },
};

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  (getServerSession as any).mockResolvedValue(activeSession);
  (prisma.user.findUnique as any).mockResolvedValue({ active: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────────────

describe("isUserActive cache (via withApiAuth)", () => {
  it("calls prisma.user.findUnique on first request (cache miss)", async () => {
    const handler = withApiAuth(async () => NextResponse.json({ ok: true }));
    const res = await handler(mockReq());

    expect(res.status).toBe(200);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-cache-1" },
      select: { active: true },
    });
  });

  it("does NOT call prisma.user.findUnique on second request within 60s (cache hit)", async () => {
    const handler = withApiAuth(async () => NextResponse.json({ ok: true }));

    // First request — cache miss
    await handler(mockReq());
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    // Second request — cache hit
    await handler(mockReq());
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1); // still 1
  });

  it("calls prisma.user.findUnique again after 60s (cache expired)", async () => {
    vi.useFakeTimers();

    const handler = withApiAuth(async () => NextResponse.json({ ok: true }));

    // First request — cache miss
    await handler(mockReq());
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    // Advance time past the 60s TTL
    vi.advanceTimersByTime(61_000);

    // Third request — cache expired, should hit DB again
    await handler(mockReq());
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("_clearUserActiveCache forces a cache miss on next request", async () => {
    const handler = withApiAuth(async () => NextResponse.json({ ok: true }));

    // First request — cache miss
    await handler(mockReq());
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    // Second request — cache hit (no additional DB call)
    await handler(mockReq());
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    // Clear the cache
    _clearUserActiveCache();

    // Next request — forced cache miss
    await handler(mockReq());
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("caches deactivated user — second request returns 401 without DB call", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ active: false });

    const handler = withApiAuth(async () => NextResponse.json({ ok: true }));

    // First request — cache miss, DB says inactive
    const res1 = await handler(mockReq());
    expect(res1.status).toBe(401);
    expect(await res1.json()).toEqual({ error: "Account deactivated" });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    // Second request — cached as inactive, no DB call
    const res2 = await handler(mockReq());
    expect(res2.status).toBe(401);
    expect(await res2.json()).toEqual({ error: "Account deactivated" });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1); // still 1
  });
});
