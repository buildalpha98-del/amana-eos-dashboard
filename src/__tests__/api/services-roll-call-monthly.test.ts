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

// Import AFTER mocks.
import { GET } from "@/app/api/services/[id]/roll-call/monthly/route";

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
}

describe("GET /api/services/[id]/roll-call/monthly", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/monthly?month=2026-04",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when month is missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/roll-call/monthly"),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when month is malformed (non-date)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/monthly?month=not-a-month",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when month=2025-13 (invalid month)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/monthly?month=2025-13",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when non-admin is at a different service", async () => {
    mockSession({
      id: "staff-1",
      name: "Staff",
      role: "staff",
      serviceId: "svc-OTHER",
    });

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/monthly?month=2026-04",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.attendanceRecord.groupBy).not.toHaveBeenCalled();
    expect(prismaMock.booking.groupBy).not.toHaveBeenCalled();
  });

  it("returns 200 with correct per-day counts (admin)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    // Seed: 2 present + 1 absent on 2026-04-20, 1 booked on 2026-04-21
    prismaMock.attendanceRecord.groupBy.mockResolvedValue([
      {
        date: new Date("2026-04-20T00:00:00.000Z"),
        status: "present",
        _count: { _all: 2 },
      },
      {
        date: new Date("2026-04-20T00:00:00.000Z"),
        status: "absent",
        _count: { _all: 1 },
      },
      {
        date: new Date("2026-04-21T00:00:00.000Z"),
        status: "booked",
        _count: { _all: 1 },
      },
    ]);
    prismaMock.booking.groupBy.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/monthly?month=2026-04",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.month).toBe("2026-04");
    // April 2026 has 30 days
    expect(body.days).toHaveLength(30);

    const day20 = body.days.find((d: { date: string }) => d.date === "2026-04-20");
    expect(day20).toEqual({
      date: "2026-04-20",
      booked: 0,
      attended: 2,
      absent: 1,
    });

    const day21 = body.days.find((d: { date: string }) => d.date === "2026-04-21");
    expect(day21).toEqual({
      date: "2026-04-21",
      booked: 1,
      attended: 0,
      absent: 0,
    });

    // Every other day should be zeroed
    const day22 = body.days.find((d: { date: string }) => d.date === "2026-04-22");
    expect(day22).toEqual({
      date: "2026-04-22",
      booked: 0,
      attended: 0,
      absent: 0,
    });

    // Verify first and last day
    expect(body.days[0].date).toBe("2026-04-01");
    expect(body.days[29].date).toBe("2026-04-30");
  });

  it("falls back to booking counts when no attendance records exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
    prismaMock.booking.groupBy.mockResolvedValue([
      {
        date: new Date("2026-04-15T00:00:00.000Z"),
        _count: { _all: 5 },
      },
    ]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/monthly?month=2026-04",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const day15 = body.days.find((d: { date: string }) => d.date === "2026-04-15");
    expect(day15).toEqual({
      date: "2026-04-15",
      booked: 5,
      attended: 0,
      absent: 0,
    });
  });

  it("returns 200 for coordinator at own service", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "coordinator",
      serviceId: "svc-1",
    });

    prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
    prismaMock.booking.groupBy.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/monthly?month=2026-04",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
  });

  it("uses UTC-safe month boundary (start=first-of-month, end=first-of-next)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
    prismaMock.booking.groupBy.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/monthly?month=2026-04",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);

    const attCall = prismaMock.attendanceRecord.groupBy.mock.calls[0][0];
    const gte = attCall.where.date.gte as Date;
    const lt = attCall.where.date.lt as Date;
    expect(gte.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});
