import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
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

// Import after mocks
import { GET } from "@/app/api/email/analytics/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/email/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    // Defaults so unmocked calls don't crash the route
    prismaMock.deliveryLog.findMany.mockResolvedValue([]);
    prismaMock.deliveryLog.groupBy.mockResolvedValue([]);
    prismaMock.emailEvent.groupBy.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/email/analytics");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns uniqueOpens and uniqueClicks sourced from an emailEvent.groupBy over the window", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.emailEvent.groupBy.mockResolvedValue([
      { type: "opened", _count: 12 },
      { type: "clicked", _count: 4 },
    ]);

    const req = createRequest("GET", "/api/email/analytics?days=30");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.uniqueOpens).toBe(12);
    expect(body.stats.uniqueClicks).toBe(4);

    expect(prismaMock.emailEvent.groupBy).toHaveBeenCalledTimes(1);
    const call = prismaMock.emailEvent.groupBy.mock.calls[0][0];
    expect(call.by).toEqual(["type"]);
    expect(call.where.type).toEqual({ in: ["opened", "clicked"] });
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("defaults uniqueOpens/uniqueClicks to 0 when no matching events exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.emailEvent.groupBy.mockResolvedValue([]);

    const req = createRequest("GET", "/api/email/analytics?days=30");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.uniqueOpens).toBe(0);
    expect(body.stats.uniqueClicks).toBe(0);
  });

  it("derives dailyVolume from a dedicated full-window query, not the 50-row recentSends slice", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    // recentSends: only 2 rows (simulating the take:50 slice)
    prismaMock.deliveryLog.findMany.mockResolvedValueOnce([
      {
        id: "log-1",
        channel: "email",
        messageType: "digest",
        subject: "Subject 1",
        status: "sent",
        recipientCount: 3,
        serviceCode: "SVC1",
        entityType: null,
        createdAt: new Date("2026-08-05T10:00:00.000Z"),
      },
    ]);

    // dedicated dailyVolume window query returns more rows than recentSends
    prismaMock.deliveryLog.findMany.mockResolvedValueOnce([
      { createdAt: new Date("2026-08-01T09:00:00.000Z") },
      { createdAt: new Date("2026-08-01T11:00:00.000Z") },
      { createdAt: new Date("2026-08-02T09:00:00.000Z") },
      { createdAt: new Date("2026-08-05T10:00:00.000Z") },
    ]);

    const req = createRequest("GET", "/api/email/analytics?days=30");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    // dailyVolume reflects the full-window query (3 distinct days, 4 events),
    // not just the single recentSends row.
    const totalVolume = body.dailyVolume.reduce((sum: number, d: { count: number }) => sum + d.count, 0);
    expect(totalVolume).toBe(4);
    expect(body.dailyVolume.find((d: { date: string }) => d.date === "2026-08-01")?.count).toBe(2);

    // Exactly two deliveryLog.findMany calls: recentSends (take: 50) and the
    // dedicated window query (no take limit).
    expect(prismaMock.deliveryLog.findMany).toHaveBeenCalledTimes(2);
    const calls = prismaMock.deliveryLog.findMany.mock.calls.map((c: unknown[]) => c[0] as Record<string, unknown>);

    const recentSendsCall = calls.find((c) => c.take === 50);
    expect(recentSendsCall).toBeDefined();
    expect((recentSendsCall!.where as { createdAt: { gte: Date } }).createdAt.gte).toBeInstanceOf(Date);

    const volumeCall = calls.find((c) => c.take === undefined);
    expect(volumeCall).toBeDefined();
    expect((volumeCall!.where as { createdAt: { gte: Date } }).createdAt.gte).toBeInstanceOf(Date);
    expect(volumeCall!.select).toEqual({ createdAt: true });
  });
});
