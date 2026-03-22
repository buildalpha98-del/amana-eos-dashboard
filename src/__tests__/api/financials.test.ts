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

// Import AFTER mocks are set up
import { GET, POST } from "@/app/api/financials/route";

// Helper to create a mock financial record
function makeMockFinancial(overrides: Record<string, unknown> = {}) {
  return {
    id: "fin-1",
    serviceId: "svc-1",
    periodType: "weekly",
    periodStart: new Date("2025-03-03"),
    periodEnd: new Date("2025-03-09"),
    bscRevenue: 5000,
    ascRevenue: 4000,
    vcRevenue: 1000,
    otherRevenue: 500,
    totalRevenue: 10500,
    staffCosts: 4000,
    foodCosts: 500,
    suppliesCosts: 300,
    rentCosts: 1000,
    adminCosts: 200,
    otherCosts: 100,
    totalCosts: 6100,
    grossProfit: 4400,
    margin: 41.9,
    bscAttendance: 100,
    ascAttendance: 80,
    vcAttendance: 20,
    bscEnrolments: 30,
    ascEnrolments: 25,
    budgetRevenue: 11000,
    budgetCosts: 6000,
    dataSource: "manual",
    service: { id: "svc-1", name: "Sunnyside", code: "SUN", state: "NSW", status: "active" },
    ...overrides,
  };
}

describe("GET /api/financials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/financials");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns financial data for authenticated user", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const mockFinancials = [makeMockFinancial()];
    prismaMock.financialPeriod.findMany.mockResolvedValue(mockFinancials);

    const req = createRequest("GET", "/api/financials");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.financials).toHaveLength(1);
    expect(body.summary).toBeDefined();
    expect(body.summary.totalRevenue).toBe(10500);
    expect(body.summary.totalCosts).toBe(6100);
    expect(body.summary.centreCount).toBe(1);
  });

  it("accepts period query parameter (weekly/monthly)", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const mockFinancials = [makeMockFinancial({ periodType: "weekly" })];
    prismaMock.financialPeriod.findMany.mockResolvedValue(mockFinancials);

    const req = createRequest("GET", "/api/financials?period=weekly");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usedPeriod).toBe("weekly");

    // Verify the first findMany call used "weekly" as periodType
    const callArgs = prismaMock.financialPeriod.findMany.mock.calls[0][0];
    expect(callArgs.where.periodType).toBe("weekly");
  });

  it("falls back to weekly when no monthly data exists", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const weeklyData = [makeMockFinancial({ periodType: "weekly" })];

    // First call (monthly) returns empty, second call (weekly) returns data
    prismaMock.financialPeriod.findMany
      .mockResolvedValueOnce([]) // monthly — empty
      .mockResolvedValueOnce(weeklyData); // weekly fallback

    const req = createRequest("GET", "/api/financials?period=monthly");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usedPeriod).toBe("weekly");
    expect(body.financials).toHaveLength(1);

    // Verify two findMany calls were made
    expect(prismaMock.financialPeriod.findMany).toHaveBeenCalledTimes(2);
    // First with monthly
    expect(prismaMock.financialPeriod.findMany.mock.calls[0][0].where.periodType).toBe("monthly");
    // Second with weekly
    expect(prismaMock.financialPeriod.findMany.mock.calls[1][0].where.periodType).toBe("weekly");
  });
});

describe("POST /api/financials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("POST", "/api/financials", {
      body: {
        serviceId: "svc-1",
        periodType: "weekly",
        periodStart: "2025-03-03",
        periodEnd: "2025-03-09",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("creates financial record with valid data", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const mockRecord = makeMockFinancial();
    prismaMock.financialPeriod.upsert.mockResolvedValue(mockRecord);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/financials", {
      body: {
        serviceId: "svc-1",
        periodType: "weekly",
        periodStart: "2025-03-03",
        periodEnd: "2025-03-09",
        bscRevenue: 5000,
        ascRevenue: 4000,
        vcRevenue: 1000,
        otherRevenue: 500,
        staffCosts: 4000,
        foodCosts: 500,
        suppliesCosts: 300,
        rentCosts: 1000,
        adminCosts: 200,
        otherCosts: 100,
        bscAttendance: 100,
        ascAttendance: 80,
        vcAttendance: 20,
        bscEnrolments: 30,
        ascEnrolments: 25,
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("fin-1");
    expect(prismaMock.financialPeriod.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.activityLog.create).toHaveBeenCalledOnce();
  });
});
