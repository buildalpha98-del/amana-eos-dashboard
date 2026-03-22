import { describe, it, expect, vi, beforeEach } from "vitest";
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
  hasFeature: vi.fn((role: string, feature: string) => {
    if (role === "owner") return true;
    return false;
  }),
  hasMinRole: vi.fn((current: string, required: string) => {
    const priority: Record<string, number> = {
      owner: 5,
      admin: 4,
      member: 2,
      staff: 1,
    };
    return (priority[current] || 0) >= (priority[required] || 0);
  }),
}));

// ── Imports (after mocks) ──────────────────────────────────────

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { withApiAuth, _clearUserActiveCache } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

// ── Helpers ────────────────────────────────────────────────────

const mockReq = new NextRequest("http://localhost/api/test", { method: "GET" });

const parseJson = async (res: NextResponse) => res.json();

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache(); // Prevent cached results from leaking between tests
  (getServerSession as any).mockResolvedValue({
    user: { id: "user-1", role: "owner", email: "test@test.com" },
  });
  (prisma.user.findUnique as any).mockResolvedValue({ active: true });
  (checkRateLimit as any).mockResolvedValue({ limited: false, remaining: 59, resetIn: 60000 });
});

// ── Tests ──────────────────────────────────────────────────────

describe("withApiAuth", () => {
  // ── Authentication ─────────────────────────────────────────

  describe("Authentication", () => {
    it("returns 401 when no session", async () => {
      (getServerSession as any).mockResolvedValue(null);

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }));
      const res = await handler(mockReq);

      expect(res.status).toBe(401);
      expect(await parseJson(res)).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when session has no user", async () => {
      (getServerSession as any).mockResolvedValue({ user: null });

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }));
      const res = await handler(mockReq);

      expect(res.status).toBe(401);
      expect(await parseJson(res)).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when user is deactivated", async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ active: false });

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }));
      const res = await handler(mockReq);

      expect(res.status).toBe(401);
      expect(await parseJson(res)).toEqual({ error: "Account deactivated" });
    });

    it("returns 401 when user not found in database", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }));
      const res = await handler(mockReq);

      expect(res.status).toBe(401);
      expect(await parseJson(res)).toEqual({ error: "Account deactivated" });
    });
  });

  // ── Authorization ──────────────────────────────────────────

  describe("Authorization", () => {
    it("returns 403 when role not in allowed list", async () => {
      (getServerSession as any).mockResolvedValue({
        user: { id: "user-1", role: "staff", email: "staff@test.com" },
      });

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }), {
        roles: ["owner", "admin"] as any,
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(403);
      expect(await parseJson(res)).toEqual({ error: "Forbidden" });
    });

    it("passes when role is in allowed list", async () => {
      const handler = withApiAuth(async () => NextResponse.json({ ok: true }), {
        roles: ["owner"] as any,
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(200);
      expect(await parseJson(res)).toEqual({ ok: true });
    });

    it("returns 403 when role below minRole", async () => {
      (getServerSession as any).mockResolvedValue({
        user: { id: "user-1", role: "member", email: "member@test.com" },
      });

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }), {
        minRole: "admin" as any,
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(403);
      expect(await parseJson(res)).toEqual({ error: "Forbidden" });
    });

    it("passes when role meets minRole", async () => {
      const handler = withApiAuth(async () => NextResponse.json({ ok: true }), {
        minRole: "admin" as any,
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(200);
      expect(await parseJson(res)).toEqual({ ok: true });
    });

    it("returns 403 when feature check fails", async () => {
      (getServerSession as any).mockResolvedValue({
        user: { id: "user-1", role: "staff", email: "staff@test.com" },
      });

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }), {
        feature: "timesheets.approve" as any,
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(403);
      expect(await parseJson(res)).toEqual({ error: "Forbidden" });
    });

    it("passes when feature check succeeds for owner", async () => {
      const handler = withApiAuth(async () => NextResponse.json({ ok: true }), {
        feature: "timesheets.approve" as any,
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(200);
      expect(await parseJson(res)).toEqual({ ok: true });
    });

    it("allows any authenticated user when no options provided", async () => {
      (getServerSession as any).mockResolvedValue({
        user: { id: "user-1", role: "staff", email: "staff@test.com" },
      });

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }));
      const res = await handler(mockReq);

      expect(res.status).toBe(200);
      expect(await parseJson(res)).toEqual({ ok: true });
    });
  });

  // ── Error Handling ─────────────────────────────────────────

  describe("Error handling", () => {
    it("catches ApiError and returns correct status", async () => {
      const handler = withApiAuth(async () => {
        throw new ApiError(422, "Validation failed");
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(422);
      expect(await parseJson(res)).toEqual({ error: "Validation failed" });
    });

    it("catches ApiError with details", async () => {
      const handler = withApiAuth(async () => {
        throw new ApiError(400, "Bad request", { field: "name" });
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(400);
      expect(await parseJson(res)).toEqual({
        error: "Bad request",
        details: { field: "name" },
      });
    });

    it("catches unknown errors and returns 500", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      const handler = withApiAuth(async () => {
        throw new Error("Something broke");
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(500);
      expect(await parseJson(res)).toEqual({ error: "Internal server error" });

      spy.mockRestore();
    });
  });

  // ── Handler Execution ──────────────────────────────────────

  describe("Handler execution", () => {
    it("calls handler with req, session, and context", async () => {
      const handlerFn = vi.fn(async (_req, session) =>
        NextResponse.json({ userId: session.user.id }),
      );
      const context = { params: Promise.resolve({ id: "123" }) };

      const wrapped = withApiAuth(handlerFn);
      await wrapped(mockReq, context);

      expect(handlerFn).toHaveBeenCalledOnce();
      expect(handlerFn).toHaveBeenCalledWith(
        mockReq,
        expect.objectContaining({
          user: { id: "user-1", role: "owner", email: "test@test.com" },
        }),
        context,
      );
    });

    it("returns handler's response on success", async () => {
      const handler = withApiAuth(async () =>
        NextResponse.json({ data: [1, 2, 3] }, { status: 201 }),
      );
      const res = await handler(mockReq);

      expect(res.status).toBe(201);
      expect(await parseJson(res)).toEqual({ data: [1, 2, 3] });
    });

    it("passes session to handler with correct user info", async () => {
      const handler = withApiAuth(async (_req, session) =>
        NextResponse.json({
          id: session.user.id,
          role: session.user.role,
          email: session.user.email,
        }),
      );
      const res = await handler(mockReq);

      expect(res.status).toBe(200);
      expect(await parseJson(res)).toEqual({
        id: "user-1",
        role: "owner",
        email: "test@test.com",
      });
    });
  });

  // ── Rate Limiting ─────────────────────────────────────────

  describe("Rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      (checkRateLimit as any).mockResolvedValue({ limited: true, remaining: 0, resetIn: 30000 });

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }));
      const res = await handler(mockReq);

      expect(res.status).toBe(429);
      expect(await parseJson(res)).toEqual({ error: "Too many requests" });
      expect(res.headers.get("Retry-After")).toBe("30");
    });

    it("calls checkRateLimit with user ID by default", async () => {
      const handler = withApiAuth(async () => NextResponse.json({ ok: true }));
      await handler(mockReq);

      expect(checkRateLimit).toHaveBeenCalledWith("auth:user-1:/api/test", 60, 60000);
    });

    it("uses custom rate limit config when provided", async () => {
      const handler = withApiAuth(async () => NextResponse.json({ ok: true }), {
        rateLimit: { max: 10, windowMs: 30000 },
      });
      await handler(mockReq);

      expect(checkRateLimit).toHaveBeenCalledWith("auth:user-1:/api/test", 10, 30000);
    });

    it("skips rate limiting when rateLimit is false", async () => {
      const handler = withApiAuth(async () => NextResponse.json({ ok: true }), {
        rateLimit: false,
      });
      const res = await handler(mockReq);

      expect(res.status).toBe(200);
      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("sets x-request-id header on success responses", async () => {
      // Send a request WITH an x-request-id to avoid depending on generateRequestId mock
      const reqWithId = new NextRequest("http://localhost/api/test", {
        method: "GET",
        headers: { "x-request-id": "my-trace-id" },
      });

      const handler = withApiAuth(async () => NextResponse.json({ ok: true }));
      const res = await handler(reqWithId);

      // Verify success first (if auth/rate-limit returns early, header won't be set)
      expect(res.status).toBe(200);
      expect(res.headers.get("x-request-id")).toBe("my-trace-id");
    });
  });

  // ── Timeout ───────────────────────────────────────────────

  describe("Timeout", () => {
    it("returns 504 when handler exceeds timeout", async () => {
      const handler = withApiAuth(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return NextResponse.json({ ok: true });
        },
        { timeoutMs: 50 },
      );
      const res = await handler(mockReq);

      expect(res.status).toBe(504);
      expect(await parseJson(res)).toEqual({ error: "Request timed out" });
    });

    it("succeeds when handler completes within timeout", async () => {
      const handler = withApiAuth(
        async () => NextResponse.json({ ok: true }),
        { timeoutMs: 5000 },
      );
      const res = await handler(mockReq);

      expect(res.status).toBe(200);
    });

    it("disables timeout when timeoutMs is 0", async () => {
      const handler = withApiAuth(
        async () => {
          // Short delay to prove it waits
          await new Promise((resolve) => setTimeout(resolve, 10));
          return NextResponse.json({ ok: true });
        },
        { timeoutMs: 0 },
      );
      const res = await handler(mockReq);

      expect(res.status).toBe(200);
    });
  });
});
