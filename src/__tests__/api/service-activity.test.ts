import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
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

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/services/[id]/activity/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("GET /api/services/[id]/activity", () => {
  it("401 when not authed", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/services/s1/activity"),
      await ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("403 for cross-service coordinator", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "other",
    });
    const res = await GET(
      createRequest("GET", "/api/services/s1/activity"),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("filters to NQS actions and returns friendly labels", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.activityLog.findMany.mockResolvedValue([
      {
        id: "log1",
        action: "created_reflection",
        entityType: "StaffReflection",
        entityId: "r1",
        details: { serviceId: "s1", type: "weekly" },
        createdAt: new Date(),
        user: { id: "u1", name: "Mirna", avatar: null },
      },
      {
        id: "log2",
        action: "logged_medication",
        entityType: "MedicationAdministration",
        entityId: "m1",
        details: { serviceId: "s1", route: "oral" },
        createdAt: new Date(),
        user: { id: "u2", name: "Daniel", avatar: null },
      },
    ]);
    const res = await GET(
      createRequest("GET", "/api/services/s1/activity"),
      await ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].actionLabel).toBe("wrote a reflection");
    expect(body.items[1].actionLabel).toBe("logged a medication dose");

    // Verify the query targets the right action set
    const where = prismaMock.activityLog.findMany.mock.calls[0][0].where;
    expect(where.action.in).toContain("created_reflection");
    expect(where.action.in).toContain("logged_medication");
    expect(where.action.in).toContain("approved_risk_assessment");
    expect(where.details.equals).toBe("s1");
  });

  it("respects the limit parameter (clamped to safeLimit ceiling)", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.activityLog.findMany.mockResolvedValue([]);
    await GET(
      createRequest("GET", "/api/services/s1/activity?limit=5"),
      await ctx(),
    );
    const args = prismaMock.activityLog.findMany.mock.calls[0][0];
    expect(args.take).toBe(5);
  });

  it("admin can see any service's activity (org-wide bypass)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.activityLog.findMany.mockResolvedValue([]);
    const res = await GET(
      createRequest("GET", "/api/services/s1/activity"),
      await ctx(),
    );
    expect(res.status).toBe(200);
  });
});
