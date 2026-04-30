import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Mock rate-limit so 429s do not interfere.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));

// Mock logger.
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

// Import after mocks.
import { GET } from "@/app/api/roster/shifts/mine/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShift(overrides: Record<string, unknown> = {}) {
  return {
    id: "sh-mine-1",
    serviceId: "svc-1",
    userId: "u-self",
    staffName: "Self User",
    date: new Date("2026-04-22"),
    sessionType: "asc",
    shiftStart: "15:00",
    shiftEnd: "18:00",
    role: "educator",
    status: "published",
    publishedAt: new Date(),
    createdById: "admin-1",
    syncedAt: new Date(),
    service: { id: "svc-1", name: "Amana OSHC" },
    ...overrides,
  };
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    return Promise.resolve({ active: true });
  });
}

// ---------------------------------------------------------------------------
// GET /api/roster/shifts/mine
// ---------------------------------------------------------------------------

describe("GET /api/roster/shifts/mine", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest(
        "GET",
        "/api/roster/shifts/mine?from=2026-04-20&to=2026-04-27",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when from/to are missing", async () => {
    mockSession({ id: "u-self", name: "Self", role: "staff" });
    const res = await GET(
      createRequest("GET", "/api/roster/shifts/mine"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when dates are malformed", async () => {
    mockSession({ id: "u-self", name: "Self", role: "staff" });
    const res = await GET(
      createRequest(
        "GET",
        "/api/roster/shifts/mine?from=20-04-2026&to=27-04-2026",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when only one bound is provided", async () => {
    mockSession({ id: "u-self", name: "Self", role: "staff" });
    const res = await GET(
      createRequest("GET", "/api/roster/shifts/mine?from=2026-04-20"),
    );
    expect(res.status).toBe(400);
  });

  it("returns own published shifts for the window (staff happy path)", async () => {
    mockSession({ id: "u-self", name: "Self", role: "staff" });
    prismaMock.rosterShift.findMany.mockResolvedValue([makeShift()]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/roster/shifts/mine?from=2026-04-20&to=2026-04-27",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shifts).toHaveLength(1);
    expect(body.shifts[0].id).toBe("sh-mine-1");

    // Query must scope to the caller's own userId and status=published.
    const call = prismaMock.rosterShift.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe("u-self");
    expect(call.where.status).toBe("published");
    expect(call.where.date.gte).toBeInstanceOf(Date);
    expect(call.where.date.lte).toBeInstanceOf(Date);
  });

  it("ignores a ?userId= query param — always scopes to the session user", async () => {
    // Admin tries to fetch another user's shifts via this route by passing ?userId=
    // The route has no support for that param; it must silently still scope to self.
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/roster/shifts/mine?from=2026-04-20&to=2026-04-27&userId=someone-else",
      ),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.rosterShift.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe("admin-1");
    expect(call.where.userId).not.toBe("someone-else");
  });

  it("excludes draft shifts (status=published only)", async () => {
    mockSession({ id: "u-self", name: "Self", role: "staff" });
    prismaMock.rosterShift.findMany.mockResolvedValue([]);

    await GET(
      createRequest(
        "GET",
        "/api/roster/shifts/mine?from=2026-04-20&to=2026-04-27",
      ),
    );
    const call = prismaMock.rosterShift.findMany.mock.calls[0][0];
    expect(call.where.status).toBe("published");
  });

  it("returns an empty array when the user has no shifts", async () => {
    mockSession({ id: "u-self", name: "Self", role: "staff" });
    prismaMock.rosterShift.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/roster/shifts/mine?from=2026-04-20&to=2026-04-27",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shifts).toEqual([]);
  });
});
