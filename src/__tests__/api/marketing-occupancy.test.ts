import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET } from "@/app/api/marketing/occupancy/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const SERVICE = {
  id: "s-1",
  name: "Minarah College",
  code: "MIN",
  state: "NSW",
  schoolPopulation: 400,
  ascTarget: 60,
  bscTarget: 20,
  weeklyAttendanceTarget: 300,
  parentSegment: null,
  parentDriver: null,
  launchDate: null,
  launchPhase: null,
};

function mockAttendance() {
  // Latest enrolment snapshots per session type
  prismaMock.dailyAttendance.findFirst.mockImplementation(async ({ where }: any) =>
    where.sessionType === "bsc"
      ? { enrolled: 12, attended: 10 }
      : { enrolled: 30, attended: 25 },
  );
  // The route issues two aggregates per service: this week (partial week,
  // Monday → today) and last week (a full 7-day window). Route on window
  // length — only the last-week window spans (about) 7 days.
  prismaMock.dailyAttendance.aggregate.mockImplementation(async ({ where }: any) => {
    const spanMs = where.date.lt.getTime() - where.date.gte.getTime();
    const isLastWeek = spanMs > 6.5 * 24 * 60 * 60 * 1000;
    return isLastWeek
      ? { _sum: { attended: 100 }, _count: 5 } // avg 20/day
      : { _sum: { attended: 66 }, _count: 3 }; // avg 22/day → +10%
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("GET /api/marketing/occupancy", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/marketing/occupancy"));
    expect(res.status).toBe(401);
  });

  it("403 staff", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await GET(createRequest("GET", "/api/marketing/occupancy"));
    expect(res.status).toBe(403);
  });

  it("returns the centre contract read by OccupancyHeatmap and BSCGrowthTracker", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([SERVICE]);
    mockAttendance();

    const res = await GET(createRequest("GET", "/api/marketing/occupancy"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.centres).toHaveLength(1);
    const centre = data.centres[0];
    // Contract field names — these are what the marketing components read
    expect(centre.serviceId).toBe("s-1");
    expect(centre.serviceName).toBe("Minarah College");
    expect(centre.serviceCode).toBe("MIN");
    expect(centre.currentBSC).toBe(12);
    expect(centre.currentASC).toBe(30);
    expect(centre.bscTarget).toBe(20);
    expect(centre.ascTarget).toBe(60);
    expect(centre.weekOnWeekTrend).toBe(10); // (22 - 20) / 20 = +10%
    expect(centre.thisWeekAttended).toBe(66);
    // Network summary
    expect(data.network.totalCurrentWeekly).toBe(66);
    expect(data.network.target).toBe(2000);
  });

  it("filters services by state", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([]);

    const res = await GET(createRequest("GET", "/api/marketing/occupancy?state=VIC"));
    expect(res.status).toBe(200);
    const findArgs = prismaMock.service.findMany.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({ status: "active", state: "VIC" });
  });

  it("handles services with no attendance rows", async () => {
    mockSession({ id: "jayden", name: "Jayden", role: "owner" });
    prismaMock.service.findMany.mockResolvedValue([SERVICE]);
    prismaMock.dailyAttendance.findFirst.mockResolvedValue(null);
    prismaMock.dailyAttendance.aggregate.mockResolvedValue({
      _sum: { attended: null },
      _count: 0,
    });

    const res = await GET(createRequest("GET", "/api/marketing/occupancy"));
    expect(res.status).toBe(200);
    const centre = (await res.json()).centres[0];
    expect(centre.currentBSC).toBe(0);
    expect(centre.currentASC).toBe(0);
    expect(centre.weekOnWeekTrend).toBe(0);
  });
});
