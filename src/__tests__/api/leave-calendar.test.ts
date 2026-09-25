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
import { GET } from "@/app/api/leave/calendar/route";

const CAL_ROW = {
  userId: "staff-1",
  leaveType: "annual",
  startDate: new Date("2026-09-07"),
  endDate: new Date("2026-09-11"),
  status: "leave_approved",
  totalDays: 5,
  user: { id: "staff-1", name: "Jane Doe" },
};

describe("GET /api/leave/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/leave/calendar?year=2026&month=9"),
    );
    expect(res.status).toBe(401);
  });

  it("400 when year/month missing or non-numeric", async () => {
    mockSession({ id: "owner-1", name: "O", role: "owner" });

    const missing = await GET(createRequest("GET", "/api/leave/calendar"));
    expect(missing.status).toBe(400);

    const junk = await GET(
      createRequest("GET", "/api/leave/calendar?year=abc&month=xyz"),
    );
    expect(junk.status).toBe(400);

    const badMonth = await GET(
      createRequest("GET", "/api/leave/calendar?year=2026&month=13"),
    );
    expect(badMonth.status).toBe(400);
  });

  it("403 for staff/member/marketing (was an org-wide leave PII leak)", async () => {
    for (const role of ["staff", "member", "marketing"] as const) {
      mockSession({ id: `${role}-1`, name: "X", role, serviceId: "svc-1" });
      const res = await GET(
        createRequest("GET", "/api/leave/calendar?year=2026&month=9"),
      );
      expect(res.status).toBe(403);
    }
    expect(prismaMock.leaveRequest.findMany).not.toHaveBeenCalled();
  });

  it("200 for admin-tier roles (the /leave Team Calendar tab's gate)", async () => {
    prismaMock.leaveRequest.findMany.mockResolvedValue([CAL_ROW]);
    for (const role of ["owner", "head_office", "admin", "eos"] as const) {
      mockSession({ id: `${role}-1`, name: "X", role });
      const res = await GET(
        createRequest("GET", "/api/leave/calendar?year=2026&month=9"),
      );
      expect(res.status).toBe(200);
    }
    const body = await (
      await GET(createRequest("GET", "/api/leave/calendar?year=2026&month=9"))
    ).json();
    expect(body).toHaveLength(1);
    expect(body[0].userName).toBe("Jane Doe");
  });

  it("applies the optional serviceId narrowing filter", async () => {
    mockSession({ id: "owner-1", name: "O", role: "owner" });
    prismaMock.leaveRequest.findMany.mockResolvedValue([]);

    await GET(
      createRequest(
        "GET",
        "/api/leave/calendar?year=2026&month=9&serviceId=svc-1",
      ),
    );
    const call = prismaMock.leaveRequest.findMany.mock.calls[0]?.[0];
    expect(call.where.serviceId).toBe("svc-1");
    expect(call.where.status).toEqual({
      in: ["leave_approved", "leave_pending"],
    });
  });
});
