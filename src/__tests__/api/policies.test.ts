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
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET as HEAT_MAP_GET } from "@/app/api/policies/heat-map/route";
import { GET as MY_PENDING_GET } from "@/app/api/policies/my-pending/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/policies/heat-map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id) return { active: true };
      return null;
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await HEAT_MAP_GET(createRequest("GET", "/api/policies/heat-map"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockSession({ id: "s-1", name: "Staff", role: "staff" });
    const res = await HEAT_MAP_GET(createRequest("GET", "/api/policies/heat-map"));
    expect(res.status).toBe(403);
  });

  it("returns rows × policies matrix for admins", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "u-1",
        name: "Alice",
        serviceId: "svc-1",
        service: { id: "svc-1", name: "Centre 1", code: "C1" },
      },
    ]);
    prismaMock.policy.findMany.mockResolvedValue([
      {
        id: "p-1",
        title: "Child Safety",
        version: 2,
        category: "safety",
        publishedAt: new Date("2026-01-01"),
      },
    ]);
    prismaMock.policyAcknowledgement.findMany.mockResolvedValue([
      {
        id: "a-1",
        userId: "u-1",
        policyId: "p-1",
        policyVersion: 2,
        acknowledgedAt: new Date("2026-02-01"),
      },
    ]);
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await HEAT_MAP_GET(createRequest("GET", "/api/policies/heat-map"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.policies).toHaveLength(1);
    expect(body.rows[0].acknowledgements).toHaveLength(1);
    expect(body.rows[0].acknowledgements[0].policyVersion).toBe(2);
    expect(body.summary.totalStaff).toBe(1);
    expect(body.summary.fullyAcknowledged).toBe(1);
  });

  it("classifies a user with one stale ack as 'partial'", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", serviceId: "svc-1", service: { id: "svc-1", name: "Centre 1", code: "C1" } },
    ]);
    prismaMock.policy.findMany.mockResolvedValue([
      { id: "p-1", title: "A", version: 2, category: null, publishedAt: new Date() },
      { id: "p-2", title: "B", version: 1, category: null, publishedAt: new Date() },
    ]);
    prismaMock.policyAcknowledgement.findMany.mockResolvedValue([
      { id: "a-1", userId: "u-1", policyId: "p-1", policyVersion: 1, acknowledgedAt: new Date() },
    ]);
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await HEAT_MAP_GET(createRequest("GET", "/api/policies/heat-map"));
    const body = await res.json();
    expect(body.summary.partial).toBe(1);
    expect(body.summary.fullyAcknowledged).toBe(0);
    expect(body.summary.none).toBe(0);
  });

  it("returns empty matrix when no policies published", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", serviceId: "svc-1", service: { id: "svc-1", name: "C1", code: "C1" } },
    ]);
    prismaMock.policy.findMany.mockResolvedValue([]);
    prismaMock.policyAcknowledgement.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await HEAT_MAP_GET(createRequest("GET", "/api/policies/heat-map"));
    const body = await res.json();
    expect(body.rows[0].acknowledgements).toHaveLength(0);
    expect(body.policies).toHaveLength(0);
  });
});

describe("GET /api/policies/my-pending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await MY_PENDING_GET(createRequest("GET", "/api/policies/my-pending"));
    expect(res.status).toBe(401);
  });

  it("returns only policies the user has not acknowledged at current version", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policy.findMany.mockResolvedValue([
      { id: "p-1", title: "A", version: 2, status: "published", deleted: false, category: null, publishedAt: new Date(), description: null, requiresReack: true, documentUrl: null, documentId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "p-2", title: "B", version: 1, status: "published", deleted: false, category: null, publishedAt: new Date(), description: null, requiresReack: true, documentUrl: null, documentId: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
    prismaMock.policyAcknowledgement.findMany.mockResolvedValue([
      { policyId: "p-2", policyVersion: 1 },
    ]);

    const res = await MY_PENDING_GET(createRequest("GET", "/api/policies/my-pending"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("p-1");
  });

  it("treats a previous-version ack as still pending", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policy.findMany.mockResolvedValue([
      { id: "p-1", title: "A", version: 2, status: "published", deleted: false, category: null, publishedAt: new Date(), description: null, requiresReack: true, documentUrl: null, documentId: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
    prismaMock.policyAcknowledgement.findMany.mockResolvedValue([
      { policyId: "p-1", policyVersion: 1 },
    ]);

    const res = await MY_PENDING_GET(createRequest("GET", "/api/policies/my-pending"));
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});
