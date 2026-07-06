import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

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

import { GET } from "@/app/api/forecast/route";

function makeRequest(weeks?: number) {
  return createRequest(
    "GET",
    `/api/forecast${weeks ? `?weeks=${weeks}` : ""}`,
  );
}

/** 8 weeks of Mon–Fri attendance rows for one service, growing weekly. */
function attendanceRows(serviceId: string, startValue: number, slope: number) {
  const rows: Array<{ serviceId: string; date: Date; attended: number; casual: number }> = [];
  const start = new Date("2026-05-04T00:00:00.000Z"); // a Monday
  for (let w = 0; w < 8; w++) {
    for (let d = 0; d < 5; d++) {
      rows.push({
        serviceId,
        date: new Date(start.getTime() + (w * 7 + d) * 24 * 60 * 60 * 1000),
        attended: startValue + w * slope,
        casual: 0,
      });
    }
  }
  return rows;
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.service.findMany.mockResolvedValue([]);
  prismaMock.dailyAttendance.findMany.mockResolvedValue([]);
  prismaMock.parentEnquiry.groupBy.mockResolvedValue([]);
  prismaMock.parentEnquiry.count.mockResolvedValue(0);
}

describe("GET /api/forecast", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    for (const role of ["member", "staff", "marketing"] as const) {
      mockSession({ id: `${role}-1`, name: role, role });
      const res = await GET(makeRequest());
      expect(res.status, `role=${role}`).toBe(403);
    }
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("clamps the horizon to 4–8 weeks", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    let res = await GET(makeRequest(52));
    expect((await res.json()).weeksAhead).toBe(8);
    res = await GET(makeRequest(1));
    expect((await res.json()).weeksAhead).toBe(4);
  });

  it("aggregates daily rows into weekly averages and forecasts per service", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-grow", name: "Greenacre", code: "GRN", capacity: 120 },
      { id: "svc-new", name: "Newtown", code: "NEW", capacity: 60 },
    ]);
    // svc-grow: 8 weeks growing 80→108; svc-new: no attendance history.
    prismaMock.dailyAttendance.findMany.mockResolvedValue(
      attendanceRows("svc-grow", 80, 4),
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    const grow = body.services.find(
      (s: { serviceId: string }) => s.serviceId === "svc-grow",
    );
    expect(grow.history).toHaveLength(8);
    expect(grow.history[0].value).toBe(80);
    expect(grow.forecast.trend).toBe("growing");
    expect(grow.forecast.points).toHaveLength(8);

    const fresh = body.services.find(
      (s: { serviceId: string }) => s.serviceId === "svc-new",
    );
    expect(fresh.forecast).toBeNull();
  });

  it("builds the pipeline forecast from stage counts and resolved history", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.parentEnquiry.groupBy.mockResolvedValue([
      { stage: "new_enquiry", _count: { _all: 10 } },
      { stage: "form_started", _count: { _all: 2 } },
    ]);
    // 40 converted, 60 cold → base rate 0.4.
    prismaMock.parentEnquiry.count
      .mockResolvedValueOnce(40)
      .mockResolvedValueOnce(60);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.pipeline.baseRate).toBeCloseTo(0.4);
    expect(body.pipeline.openTotal).toBe(12);
    expect(body.pipeline.expectedEnrolments).toBeGreaterThan(0);
  });

  it("surfaces capacity alerts for centres racing toward their limit", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-hot", name: "Hotspot", code: "HOT", capacity: 100 },
    ]);
    // 8 weeks racing 68→96 at +4/week → capacity within horizon.
    prismaMock.dailyAttendance.findMany.mockResolvedValue(
      attendanceRows("svc-hot", 68, 4),
    );

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0]).toMatchObject({
      serviceId: "svc-hot",
      kind: "capacity",
    });
  });
});
