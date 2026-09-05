import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

// Mock logger
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

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/roster/overlays/route";

const APPROVED_ROW = {
  userId: "staff-1",
  leaveType: "annual",
  startDate: new Date("2026-09-01"),
  endDate: new Date("2026-09-03"),
  isHalfDay: false,
};

const UNAVAILABLE_ROW = {
  userId: "staff-2",
  weekday: 5, // Fridays
  note: "uni",
};

function overlaysUrl(
  userIds = "staff-1,staff-2",
  from = "2026-08-31",
  to = "2026-09-04",
) {
  return `/api/roster/overlays?userIds=${encodeURIComponent(userIds)}&from=${from}&to=${to}`;
}

describe("GET /api/roster/overlays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", overlaysUrl()));
    expect(res.status).toBe(401);
  });

  it("400 when userIds/from/to are missing or malformed", async () => {
    mockSession({ id: "admin-1", name: "A", role: "admin" });

    const missingIds = await GET(
      createRequest("GET", "/api/roster/overlays?from=2026-08-31&to=2026-09-04"),
    );
    expect(missingIds.status).toBe(400);

    const badDate = await GET(
      createRequest("GET", overlaysUrl("staff-1", "not-a-date")),
    );
    expect(badDate.status).toBe(400);
  });

  it("400 when more than 200 userIds are requested", async () => {
    mockSession({ id: "admin-1", name: "A", role: "admin" });
    const ids = Array.from({ length: 201 }, (_, i) => `u${i}`).join(",");
    const res = await GET(createRequest("GET", overlaysUrl(ids)));
    expect(res.status).toBe(400);
  });

  it("403 for staff role", async () => {
    mockSession({ id: "edu-1", name: "E", role: "staff", serviceId: "svc-1" });
    const res = await GET(createRequest("GET", overlaysUrl()));
    expect(res.status).toBe(403);
  });

  it("member: intersects requested userIds against their centre's staff before querying", async () => {
    mockSession({
      id: "dir-1",
      name: "Dee",
      role: "member",
      serviceId: "svc-1",
    });
    // Only staff-1 belongs to svc-1 (primary OR active membership) —
    // staff-2 is another centre's and must never reach the overlay queries.
    prismaMock.user.findMany.mockResolvedValue([{ id: "staff-1" }]);
    prismaMock.leaveRequest.findMany.mockResolvedValue([APPROVED_ROW]);
    prismaMock.staffAvailability.findMany.mockResolvedValue([]);

    const res = await GET(createRequest("GET", overlaysUrl("staff-1,staff-2")));
    expect(res.status).toBe(200);

    const scopeCall = prismaMock.user.findMany.mock.calls[0]?.[0];
    expect(scopeCall.where.id).toEqual({ in: ["staff-1", "staff-2"] });
    expect(scopeCall.where.OR).toEqual([
      { serviceId: "svc-1" },
      { serviceMemberships: { some: { serviceId: "svc-1", status: "active" } } },
    ]);

    const leaveCall = prismaMock.leaveRequest.findMany.mock.calls[0]?.[0];
    expect(leaveCall.where.userId).toEqual({ in: ["staff-1"] });
    expect(leaveCall.where.status).toBe("leave_approved");
    // NEVER keyed on serviceId — it's nullable on LeaveRequest.
    expect(leaveCall.where.serviceId).toBeUndefined();

    // Availability is intersected against the same allow-list.
    const availCall = prismaMock.staffAvailability.findMany.mock.calls[0]?.[0];
    expect(availCall.where.userId).toEqual({ in: ["staff-1"] });
    expect(availCall.where.available).toBe(false);
  });

  it("member with no serviceId gets empty overlays without querying", async () => {
    mockSession({ id: "dir-x", name: "D", role: "member", serviceId: null });
    const res = await GET(createRequest("GET", overlaysUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leave).toEqual([]);
    expect(body.availability).toEqual([]);
    expect(prismaMock.leaveRequest.findMany).not.toHaveBeenCalled();
    expect(prismaMock.staffAvailability.findMany).not.toHaveBeenCalled();
  });

  it("member whose requested ids are all out-of-centre gets empty overlays", async () => {
    mockSession({ id: "dir-1", name: "Dee", role: "member", serviceId: "svc-1" });
    prismaMock.user.findMany.mockResolvedValue([]);
    const res = await GET(createRequest("GET", overlaysUrl("other-1,other-2")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leave).toEqual([]);
    expect(body.availability).toEqual([]);
    expect(prismaMock.leaveRequest.findMany).not.toHaveBeenCalled();
    expect(prismaMock.staffAvailability.findMany).not.toHaveBeenCalled();
  });

  it("happy path: admin gets leave + unavailable days for the window, unscoped", async () => {
    mockSession({ id: "admin-1", name: "A", role: "admin" });
    prismaMock.leaveRequest.findMany.mockResolvedValue([APPROVED_ROW]);
    prismaMock.staffAvailability.findMany.mockResolvedValue([UNAVAILABLE_ROW]);

    const res = await GET(createRequest("GET", overlaysUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leave).toHaveLength(1);
    expect(body.leave[0].userId).toBe("staff-1");
    expect(body.leave[0].isHalfDay).toBe(false);
    expect(body.availability).toEqual([
      { userId: "staff-2", weekday: 5, note: "uni" },
    ]);

    // No intersection query for admins.
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();

    const leaveCall = prismaMock.leaveRequest.findMany.mock.calls[0]?.[0];
    expect(leaveCall.where.userId).toEqual({ in: ["staff-1", "staff-2"] });
    expect(leaveCall.where.status).toBe("leave_approved");
    expect(leaveCall.where.startDate).toEqual({ lte: new Date("2026-09-04") });
    expect(leaveCall.where.endDate).toEqual({ gte: new Date("2026-08-31") });
    expect(leaveCall.select).toEqual({
      userId: true,
      leaveType: true,
      startDate: true,
      endDate: true,
      isHalfDay: true,
    });

    // Availability query ships only unavailable rows.
    const availCall = prismaMock.staffAvailability.findMany.mock.calls[0]?.[0];
    expect(availCall.where).toEqual({
      userId: { in: ["staff-1", "staff-2"] },
      available: false,
    });
    expect(availCall.select).toEqual({
      userId: true,
      weekday: true,
      note: true,
    });
  });
});
