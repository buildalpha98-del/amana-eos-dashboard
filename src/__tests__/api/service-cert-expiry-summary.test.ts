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

import { GET } from "@/app/api/services/[id]/cert-expiry-summary/route";

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function offsetDays(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function makeCert(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u-1",
    type: "wwcc" as const,
    expiryDate: offsetDays(-3),
    user: { id: "u-1", name: "Alice", avatar: null },
    ...overrides,
  };
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

describe("GET /api/services/[id]/cert-expiry-summary", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/cert-expiry-summary"),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when a member tries to read another service's summary", async () => {
    mockSession({
      id: "u-1",
      name: "Alice",
      role: "member",
      serviceId: "svc-other",
    });
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/cert-expiry-summary"),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.complianceCertificate.findMany).not.toHaveBeenCalled();
  });

  it("returns empty totals when there are no expiring certs", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/cert-expiry-summary"),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toEqual({
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 0,
    });
    expect(body.affectedStaff).toEqual([]);
  });

  it("rolls up expired and expiring certs into the totals + affected list", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      makeCert({ userId: "u-1", expiryDate: offsetDays(-3) }),
      makeCert({
        userId: "u-2",
        expiryDate: offsetDays(5),
        user: { id: "u-2", name: "Bob", avatar: null },
      }),
      makeCert({
        userId: "u-3",
        expiryDate: offsetDays(12),
        type: "first_aid",
        user: { id: "u-3", name: "Carol", avatar: "/c.png" },
      }),
    ]);
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/cert-expiry-summary"),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toEqual({
      expired: 1,
      critical: 1,
      warning: 1,
      upcoming: 0,
    });
    // Worst first.
    expect(body.affectedStaff.map((s: { userId: string }) => s.userId)).toEqual(
      ["u-1", "u-2", "u-3"],
    );
    // Names hydrated from the user relation.
    expect(body.affectedStaff[0].name).toBe("Alice");
    expect(body.affectedStaff[2].name).toBe("Carol");
    expect(body.affectedStaff[2].avatar).toBe("/c.png");
  });

  it("filters out superseded and centre-level certs at the SQL boundary", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    await GET(
      createRequest("GET", "/api/services/svc-1/cert-expiry-summary"),
      paramsOf("svc-1"),
    );
    const findManyCall =
      prismaMock.complianceCertificate.findMany.mock.calls[0][0];
    expect(findManyCall.where.serviceId).toBe("svc-1");
    expect(findManyCall.where.supersededAt).toBe(null);
    expect(findManyCall.where.userId).toEqual({ not: null });
    // expiryDate is bounded to a 30d horizon — but expired certs are
    // also picked up because the bound is `lte: horizon`, which lets
    // anything in the past through.
    expect(findManyCall.where.expiryDate.lte).toBeInstanceOf(Date);
  });

  it("allows a member to read their own service's summary", async () => {
    mockSession({
      id: "u-1",
      name: "Director",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/cert-expiry-summary"),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
  });

  it("works gracefully when a cert has no user relation hydrated (defensive)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      {
        userId: "u-1",
        type: "wwcc",
        expiryDate: offsetDays(-1),
        user: null,
      },
    ]);
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/cert-expiry-summary"),
      paramsOf("svc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affectedStaff[0]).toMatchObject({
      userId: "u-1",
      name: "Staff member",
      avatar: null,
    });
  });
});
