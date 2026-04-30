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
import { GET } from "@/app/api/services/[id]/roll-call/weekly/route";

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
}

describe("GET /api/services/[id]/roll-call/weekly", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/weekly?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when weekStart is missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/roll-call/weekly"),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when weekStart is malformed (non-date)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/weekly?weekStart=not-a-date",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when weekStart fails regex (e.g. 2025-13-01)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/weekly?weekStart=2025-13-01",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when staff is at a different service", async () => {
    mockSession({
      id: "staff-1",
      name: "Staff",
      role: "staff",
      serviceId: "svc-OTHER",
    });

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/weekly?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.child.findMany).not.toHaveBeenCalled();
    expect(prismaMock.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when non-admin has no serviceId", async () => {
    mockSession({
      id: "member-1",
      name: "Member",
      role: "member",
    });

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/weekly?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 for admin on any service with correct shape", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    const childList = [
      {
        id: "child-1",
        firstName: "Ava",
        surname: "Nguyen",
        photo: null,
        dob: new Date("2020-01-01"),
        bookingPrefs: null,
      },
    ];
    const attendance = [
      {
        id: "att-1",
        childId: "child-1",
        date: new Date("2026-04-20"),
        sessionType: "asc",
        status: "present",
        signInTime: new Date("2026-04-20T15:00:00Z"),
        signOutTime: null,
        signedInById: "admin-1",
        signedOutById: null,
        absenceReason: null,
        notes: null,
      },
    ];
    const bookings = [
      {
        id: "bk-1",
        childId: "child-1",
        date: new Date("2026-04-20"),
        sessionType: "asc",
        fee: 50,
      },
    ];

    prismaMock.child.findMany.mockResolvedValue(childList);
    prismaMock.attendanceRecord.findMany.mockResolvedValue(attendance);
    prismaMock.booking.findMany.mockResolvedValue(bookings);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/weekly?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.weekStart).toBe("2026-04-20");
    expect(body.children).toHaveLength(1);
    expect(body.attendanceRecords).toHaveLength(1);
    expect(body.bookings).toHaveLength(1);
    // Verify `date` (not `attendanceDate`) is on AttendanceRecord
    expect(body.attendanceRecords[0].date).toBeTruthy();
    expect(body.attendanceRecords[0].status).toBe("present");
    // Verify Booking has fee
    expect(body.bookings[0].fee).toBe(50);
  });

  it("returns 200 for coordinator at own service", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });

    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/weekly?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
  });

  it("filters out cancelled bookings (only confirmed/requested appear)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    // Simulate the Prisma DB-level filter: only bookings whose status is in
    // ["confirmed", "requested"] come back. A booking with status "cancelled"
    // must NOT be returned by the mocked call, so the route's response will
    // not include it.
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockImplementation((args: { where?: { status?: { in?: string[] } } } | undefined) => {
      const statusFilter = args?.where?.status;
      const allBookings = [
        {
          id: "bk-confirmed",
          childId: "child-1",
          date: new Date("2026-04-20"),
          sessionType: "asc",
          fee: 50,
          status: "confirmed",
        },
        {
          id: "bk-cancelled",
          childId: "child-2",
          date: new Date("2026-04-21"),
          sessionType: "asc",
          fee: 50,
          status: "cancelled",
        },
      ];
      const allowed =
        statusFilter?.in ?? ["confirmed", "requested", "cancelled"];
      return Promise.resolve(
        allBookings.filter((b) => allowed.includes(b.status)),
      );
    });

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/weekly?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].id).toBe("bk-confirmed");
    expect(body.bookings.some((b: { id: string }) => b.id === "bk-cancelled")).toBe(
      false,
    );

    // Verify the Prisma query itself passed the correct status filter
    const bookingCall = prismaMock.booking.findMany.mock.calls[0][0];
    expect(bookingCall.where.status).toEqual({
      in: ["confirmed", "requested"],
    });
  });

  it("computes UTC-safe 7-day window (end = start + 7 UTC days)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/roll-call/weekly?weekStart=2026-04-20",
      ),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);

    // attendanceRecord.findMany should have been called with date range
    const attCall = prismaMock.attendanceRecord.findMany.mock.calls[0][0];
    const gte = attCall.where.date.gte as Date;
    const lt = attCall.where.date.lt as Date;
    expect(lt.getTime() - gte.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    // start should be UTC midnight of 2026-04-20
    expect(gte.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-04-27T00:00:00.000Z");
  });
});
