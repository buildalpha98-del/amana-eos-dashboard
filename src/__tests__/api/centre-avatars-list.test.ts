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
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));

import { GET } from "@/app/api/centre-avatars/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/centre-avatars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "m1")
        return { id: "m1", role: "marketing", active: true };
      if (args?.where?.id === "s1")
        return { id: "s1", role: "staff", active: true };
      return null;
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/centre-avatars"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not allowed", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await GET(createRequest("GET", "/api/centre-avatars"));
    expect(res.status).toBe(403);
  });

  it("returns avatars with freshness + pending-insights count", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 86_400_000);
    prismaMock.centreAvatar.findMany.mockResolvedValue([
      {
        id: "ca1",
        serviceId: "svc1",
        lastUpdatedAt: thirtyFiveDaysAgo,
        lastUpdatedBy: { id: "m1", name: "Akram" },
        lastReviewedAt: null,
        lastFullReviewAt: null,
        lastOpenedAt: null,
        snapshot: { centreDetails: { officialName: "Amana Greystanes" } },
        service: { id: "svc1", name: "Greystanes", state: "NSW" },
        _count: { insights: 3 },
      },
    ]);

    const res = await GET(createRequest("GET", "/api/centre-avatars"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avatars).toHaveLength(1);
    expect(body.avatars[0]).toMatchObject({
      id: "ca1",
      serviceId: "svc1",
      serviceName: "Greystanes",
      state: "NSW",
      freshness: "aging",
      pendingInsightsCount: 3,
    });
  });
});
