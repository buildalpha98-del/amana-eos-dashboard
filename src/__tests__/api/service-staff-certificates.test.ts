import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
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

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/services/[id]/staff-certificates/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/services/[id]/staff-certificates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("401 without session", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/services/s1/staff-certificates"),
      await ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("403 for an educator at a different service", async () => {
    mockSession({ id: "edu-2", name: "E", role: "staff", serviceId: "s99" });
    const res = await GET(
      createRequest("GET", "/api/services/s1/staff-certificates"),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("queries certs by userId IN (primary + membership staff), not cert serviceId", async () => {
    mockSession({ id: "admin-1", name: "A", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([{ id: "primary-u1" }]);
    prismaMock.userServiceMembership.findMany.mockResolvedValue([
      { userId: "cross-centre-u2" },
    ]);
    // cross-centre-u2's cert is recorded under their HOME centre (s2) —
    // the widened query must still return it so the roster grid keeps the
    // cert shield for membership staff.
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      {
        userId: "primary-u1",
        type: "wwcc",
        expiryDate: new Date("2026-10-01T00:00:00Z"),
      },
      {
        userId: "cross-centre-u2",
        type: "first_aid",
        expiryDate: new Date("2026-09-15T00:00:00Z"),
      },
    ]);

    const res = await GET(
      createRequest("GET", "/api/services/s1/staff-certificates"),
      await ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certificates).toHaveLength(2);
    expect(
      body.certificates.map((c: { userId: string }) => c.userId).sort(),
    ).toEqual(["cross-centre-u2", "primary-u1"]);

    const certCall = prismaMock.complianceCertificate.findMany.mock.calls[0]?.[0];
    expect(certCall.where.userId).toEqual({
      in: ["primary-u1", "cross-centre-u2"],
    });
    // The old serviceId filter is gone — certs follow the person.
    expect(certCall.where.serviceId).toBeUndefined();
    expect(certCall.where.supersededAt).toBeNull();
    expect(certCall.where.expiryDate).toEqual({ not: null });
  });

  it("returns an empty list without a cert query when the service has no staff", async () => {
    mockSession({ id: "admin-1", name: "A", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.userServiceMembership.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", "/api/services/s1/staff-certificates"),
      await ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certificates).toEqual([]);
    expect(prismaMock.complianceCertificate.findMany).not.toHaveBeenCalled();
  });

  it("member of the same service can read", async () => {
    mockSession({ id: "dir-1", name: "D", role: "member", serviceId: "s1" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.userServiceMembership.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", "/api/services/s1/staff-certificates"),
      await ctx(),
    );
    expect(res.status).toBe(200);
  });
});
