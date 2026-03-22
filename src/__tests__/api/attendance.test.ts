import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Mock dependencies
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
  ),
}));
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
vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
// Mock the propagate import used by the attendance route
vi.mock("@/app/api/attendance/propagate/route", () => ({
  propagateEnrolledCounts: vi.fn(() => Promise.resolve()),
}));

// Import AFTER mocks are set up
import { GET, POST } from "@/app/api/attendance/route";

describe("GET /api/attendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/attendance");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns attendance records for authenticated user", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const mockRecords = [
      {
        id: "att-1",
        serviceId: "svc-1",
        date: new Date("2025-03-10"),
        sessionType: "bsc",
        enrolled: 30,
        attended: 25,
        capacity: 40,
        casual: 3,
        absent: 5,
        notes: null,
        recordedById: "user-1",
        service: { id: "svc-1", name: "Sunnyside", code: "SUN" },
        recordedBy: { id: "user-1", name: "Test User" },
      },
    ];

    prismaMock.dailyAttendance.findMany.mockResolvedValue(mockRecords);

    const req = createRequest("GET", "/api/attendance");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].sessionType).toBe("bsc");
    expect(body[0].enrolled).toBe(30);
    expect(prismaMock.dailyAttendance.findMany).toHaveBeenCalledOnce();
  });
});

describe("POST /api/attendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("POST", "/api/attendance", {
      body: {
        serviceId: "svc-1",
        date: "2025-03-10",
        sessionType: "bsc",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 400 with missing required fields", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const req = createRequest("POST", "/api/attendance", {
      body: {
        // Missing serviceId, date, sessionType
        enrolled: 10,
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("creates attendance record with valid data", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const mockRecord = {
      id: "att-new",
      serviceId: "svc-1",
      date: new Date("2025-03-10"),
      sessionType: "bsc",
      enrolled: 30,
      attended: 25,
      capacity: 40,
      casual: 3,
      absent: 2,
      notes: "Good day",
      recordedById: "user-1",
    };

    prismaMock.dailyAttendance.upsert.mockResolvedValue(mockRecord);

    const req = createRequest("POST", "/api/attendance", {
      body: {
        serviceId: "svc-1",
        date: "2025-03-10",
        sessionType: "bsc",
        enrolled: 30,
        attended: 25,
        capacity: 40,
        casual: 3,
        absent: 2,
        notes: "Good day",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("att-new");
    expect(body.enrolled).toBe(30);
    expect(prismaMock.dailyAttendance.upsert).toHaveBeenCalledOnce();
  });

  it("POST validates date format (rejects invalid sessionType)", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const req = createRequest("POST", "/api/attendance", {
      body: {
        serviceId: "svc-1",
        date: "2025-03-10",
        sessionType: "invalid_type", // not bsc/asc/vc
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
