import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/scorecard/rollup/route";

describe("GET /api/scorecard/rollup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 403 for coordinator", async () => {
    mockSession({ id: "u", name: "C", role: "member" });
    const res = await GET(createRequest("GET", "/api/scorecard/rollup"));
    expect(res.status).toBe(403);
  });

  it("groups measurables by service with last-week values", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });

    prismaMock.service.findMany.mockResolvedValue([
      { id: "s1", name: "Centre A", code: "A" },
      { id: "s2", name: "Centre B", code: "B" },
    ]);
    prismaMock.measurable.findMany.mockResolvedValue([
      {
        id: "m1", title: "Attendance", goalDirection: "above", goalValue: 50,
        unit: null, serviceId: "s1",
        service: { id: "s1", name: "Centre A" },
        entries: [{ weekOf: new Date("2026-04-13"), value: 55, onTrack: true }],
      },
      {
        id: "m2", title: "Attendance", goalDirection: "above", goalValue: 50,
        unit: null, serviceId: "s2",
        service: { id: "s2", name: "Centre B" },
        entries: [{ weekOf: new Date("2026-04-13"), value: 48, onTrack: false }],
      },
      {
        id: "m3", title: "Org KPI", goalDirection: "above", goalValue: 100,
        unit: null, serviceId: null, service: null,
        entries: [{ weekOf: new Date("2026-04-13"), value: 110, onTrack: true }],
      },
    ]);

    const res = await GET(createRequest("GET", "/api/scorecard/rollup"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.services).toEqual([
      { id: "s1", name: "Centre A", code: "A" },
      { id: "s2", name: "Centre B", code: "B" },
    ]);
    expect(body.rows).toHaveLength(2);
    const attendance = body.rows.find((r: { title: string }) => r.title === "Attendance");
    expect(attendance.byService.s1.value).toBe(55);
    expect(attendance.byService.s2.value).toBe(48);
    expect(attendance.byService.s1.onTrack).toBe(true);
    expect(attendance.byService.s2.onTrack).toBe(false);
  });
});
