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
import { GET } from "@/app/api/services/[id]/children/enrollable/route";

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
}

describe("GET /api/services/[id]/children/enrollable", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/children/enrollable?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when weekStart is missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/children/enrollable"),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when weekStart is malformed", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/children/enrollable?weekStart=not-a-date",
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
        "/api/services/svc-1/children/enrollable?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.child.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with children that have no attendance in the week (admin)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    // Simulate Prisma returning only the "unattended" child — the route-level
    // where clause (`attendanceRecords: { none: { ... } }`) narrows on the DB.
    const expectedChildren = [
      {
        id: "child-B",
        firstName: "Ben",
        surname: "Nguyen",
        photo: null,
        dob: new Date("2020-05-10"),
        bookingPrefs: null,
      },
    ];
    prismaMock.child.findMany.mockResolvedValue(expectedChildren);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/children/enrollable?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.children).toHaveLength(1);
    expect(body.children[0].id).toBe("child-B");

    // Verify the Prisma query uses the right `none` filter
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-1");
    expect(call.where.status).toBe("active");
    expect(call.where.attendanceRecords.none.date.gte).toBeInstanceOf(Date);
    expect(call.where.attendanceRecords.none.date.lt).toBeInstanceOf(Date);
    // 7-day window
    const gte = call.where.attendanceRecords.none.date.gte as Date;
    const lt = call.where.attendanceRecords.none.date.lt as Date;
    expect(lt.getTime() - gte.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(gte.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-04-27T00:00:00.000Z");
  });

  it("returns 200 for coordinator at own service", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "coordinator",
      serviceId: "svc-1",
    });
    prismaMock.child.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/children/enrollable?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
  });

  it("orders results by surname asc", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/children/enrollable?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ surname: "asc" });
  });
});
