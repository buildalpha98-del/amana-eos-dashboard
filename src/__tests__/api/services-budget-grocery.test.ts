import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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
vi.mock("@/lib/budget-helpers", () => ({
  getMonthlyBudget: vi.fn(() =>
    Promise.resolve({ amount: 150, source: "tier", tierLabel: "base" })
  ),
  recalcFinancialsForWeek: vi.fn(() => Promise.resolve()),
}));

import { GET } from "@/app/api/services/[id]/budget/route";

describe("GET /api/services/[id]/budget — grocery breakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    prismaMock.service.findUnique.mockResolvedValue({
      id: "svc-1",
      bscGroceryRate: 0.8,
      ascGroceryRate: 1.2,
      vcGroceryRate: 4.5,
    });
    prismaMock.budgetItem.findMany.mockResolvedValue([]);
    prismaMock.budgetItem.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  });

  it("sums both permanent (enrolled) and casual (attended) bookings per session type", async () => {
    // Matches the user's field report: 36 permanent + 8 casual = 44 BSC,
    // 94 permanent + 21 casual = 115 ASC. The previous bug only summed casual.
    prismaMock.dailyAttendance.groupBy.mockResolvedValue([
      { sessionType: "bsc", _sum: { enrolled: 36, attended: 8 } },
      { sessionType: "asc", _sum: { enrolled: 94, attended: 21 } },
    ]);
    prismaMock.dailyAttendance.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/services/svc-1/budget");
    const res = await GET(req, { params: Promise.resolve({ id: "svc-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groceryBudget.bsc.attended).toBe(44);
    expect(body.groceryBudget.asc.attended).toBe(115);
    expect(body.groceryBudget.vc.attended).toBe(0);
    // Cost = combined total × rate per head
    expect(body.groceryBudget.bsc.cost).toBeCloseTo(44 * 0.8, 6);
    expect(body.groceryBudget.asc.cost).toBeCloseTo(115 * 1.2, 6);
    expect(body.groceryBudget.total).toBeCloseTo(44 * 0.8 + 115 * 1.2, 6);
  });

  it("treats missing sums as zero without throwing", async () => {
    prismaMock.dailyAttendance.groupBy.mockResolvedValue([
      { sessionType: "bsc", _sum: { enrolled: null, attended: null } },
    ]);
    prismaMock.dailyAttendance.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/services/svc-1/budget");
    const res = await GET(req, { params: Promise.resolve({ id: "svc-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groceryBudget.bsc.attended).toBe(0);
    expect(body.groceryBudget.bsc.cost).toBe(0);
  });

  it("applies the same combined formula to per-period buckets (budget trend)", async () => {
    prismaMock.dailyAttendance.groupBy.mockResolvedValue([]);
    prismaMock.dailyAttendance.findMany.mockResolvedValue([
      // Monday — 10 permanent + 3 casual BSC
      {
        date: new Date("2026-04-13"),
        sessionType: "bsc",
        enrolled: 10,
        attended: 3,
      },
      // Tuesday — 8 permanent + 2 casual BSC
      {
        date: new Date("2026-04-14"),
        sessionType: "bsc",
        enrolled: 8,
        attended: 2,
      },
    ]);

    const req = createRequest(
      "GET",
      "/api/services/svc-1/budget?from=2026-04-13&to=2026-04-17&period=weekly"
    );
    const res = await GET(req, { params: Promise.resolve({ id: "svc-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    const weekBucket = body.periods.find(
      (p: { bscAttendance: number }) => p.bscAttendance > 0
    );
    expect(weekBucket).toBeTruthy();
    // 10+3 + 8+2 = 23 combined BSC bookings for the week
    expect(weekBucket.bscAttendance).toBe(23);
    expect(weekBucket.groceryCost).toBeCloseTo(23 * 0.8, 6);
  });
});
