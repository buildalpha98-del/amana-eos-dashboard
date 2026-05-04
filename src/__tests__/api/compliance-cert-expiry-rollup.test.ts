import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
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

import { GET } from "@/app/api/compliance/cert-expiry-rollup/route";

function offsetDays(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    return Promise.resolve({ active: true });
  });
}

describe("GET /api/compliance/cert-expiry-rollup", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/compliance/cert-expiry-rollup"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for member role (admin-tier only)", async () => {
    mockSession({
      id: "u-1",
      name: "Director",
      role: "member",
      serviceId: "svc-1",
    });
    const res = await GET(
      createRequest("GET", "/api/compliance/cert-expiry-rollup"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.complianceCertificate.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for staff role", async () => {
    mockSession({
      id: "u-1",
      name: "Educator",
      role: "staff",
      serviceId: "svc-1",
    });
    const res = await GET(
      createRequest("GET", "/api/compliance/cert-expiry-rollup"),
    );
    expect(res.status).toBe(403);
  });

  it("returns empty rollup when no certs are expiring", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    const res = await GET(
      createRequest("GET", "/api/compliance/cert-expiry-rollup"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgTotals).toEqual({
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 0,
    });
    expect(body.services).toEqual([]);
  });

  it("rolls up across services with name + state hydrated", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      {
        userId: "u-1",
        serviceId: "svc-mawson",
        type: "wwcc",
        expiryDate: offsetDays(-3),
      },
      {
        userId: "u-2",
        serviceId: "svc-mawson",
        type: "first_aid",
        expiryDate: offsetDays(5),
      },
      {
        userId: "u-3",
        serviceId: "svc-port",
        type: "wwcc",
        expiryDate: offsetDays(20),
      },
    ]);
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-mawson", name: "Mawson Lakes", code: "ML", state: "SA" },
      { id: "svc-port", name: "Port Adelaide", code: "PA", state: "SA" },
    ]);
    const res = await GET(
      createRequest("GET", "/api/compliance/cert-expiry-rollup"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgTotals).toEqual({
      expired: 1,
      critical: 1,
      warning: 0,
      upcoming: 1,
    });
    expect(body.services).toHaveLength(2);
    // Worst-first order: svc-mawson has expired (4) > svc-port upcoming (1)
    expect(body.services[0].serviceId).toBe("svc-mawson");
    expect(body.services[0].name).toBe("Mawson Lakes");
    expect(body.services[0].state).toBe("SA");
    expect(body.services[0].status).toBe("expired");
    expect(body.services[0].affectedStaffCount).toBe(2);
  });

  it("filters out superseded and centre-level certs at the SQL boundary", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/compliance/cert-expiry-rollup"));
    const findManyCall =
      prismaMock.complianceCertificate.findMany.mock.calls[0][0];
    expect(findManyCall.where.supersededAt).toBe(null);
    expect(findManyCall.where.userId).toEqual({ not: null });
    expect(findManyCall.where.expiryDate.lte).toBeInstanceOf(Date);
    // No serviceId filter — this is org-wide.
    expect(findManyCall.where.serviceId).toBeUndefined();
  });

  it("skips the service.findMany when no services have affected certs", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/compliance/cert-expiry-rollup"));
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("falls back to 'Unknown service' when service metadata is missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      {
        userId: "u-1",
        serviceId: "svc-orphan",
        type: "wwcc",
        expiryDate: offsetDays(-1),
      },
    ]);
    prismaMock.service.findMany.mockResolvedValue([]); // service was deleted
    const res = await GET(
      createRequest("GET", "/api/compliance/cert-expiry-rollup"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.services[0].name).toBe("Unknown service");
    expect(body.services[0].code).toBe(null);
    expect(body.services[0].state).toBe(null);
  });

  it("allows owner and head_office roles", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    for (const role of ["owner", "head_office"] as const) {
      mockSession({ id: `${role}-1`, name: role, role });
      const res = await GET(
        createRequest("GET", "/api/compliance/cert-expiry-rollup"),
      );
      expect(res.status, `role=${role}`).toBe(200);
    }
  });
});
