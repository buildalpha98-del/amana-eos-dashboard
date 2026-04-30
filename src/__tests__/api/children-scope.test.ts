/**
 * Centre-scope enforcement on the children list route.
 *
 * Regression coverage for the 2026-04-29 confidentiality bug — until then,
 * /api/children GET only filtered by `?serviceId=` if the caller passed it.
 * Members and staff therefore saw every child system-wide. The fix wires
 * `getCentreScope` through `applyCentreFilter` so role-based scoping is
 * enforced at the API boundary, regardless of what the UI passes.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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

import { GET } from "@/app/api/children/route";

function setupActiveUser() {
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.child.findMany.mockResolvedValue([]);
  prismaMock.child.count.mockResolvedValue(0);
  prismaMock.service.findMany.mockResolvedValue([]);
}

describe("GET /api/children — centre scope enforcement", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    setupActiveUser();
  });

  it("owner sees no serviceId filter (full access)", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    await GET(createRequest("GET", "/api/children"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBeUndefined();
  });

  it("head_office sees no serviceId filter (full access)", async () => {
    mockSession({ id: "u-ho", name: "HO", role: "head_office" });
    await GET(createRequest("GET", "/api/children"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBeUndefined();
  });

  it("admin sees no centre-scope filter (admin uses state scoping elsewhere)", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    await GET(createRequest("GET", "/api/children"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBeUndefined();
  });

  it("member sees only their assigned service's children", async () => {
    mockSession({
      id: "u-nadia",
      name: "Nadia",
      role: "member",
      serviceId: "svc-minarah",
    });
    await GET(createRequest("GET", "/api/children"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-minarah");
  });

  it("staff sees only their assigned service's children", async () => {
    mockSession({
      id: "u-staff",
      name: "Staff",
      role: "staff",
      serviceId: "svc-arkana",
    });
    await GET(createRequest("GET", "/api/children"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-arkana");
  });

  it("member with no assigned service sees nothing (sentinel filter)", async () => {
    mockSession({
      id: "u-nadia",
      name: "Nadia",
      role: "member",
      serviceId: null,
    });
    await GET(createRequest("GET", "/api/children"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("__no_access__");
  });

  it("member passing ?serviceId= for a service they DON'T own gets locked out", async () => {
    mockSession({
      id: "u-nadia",
      name: "Nadia",
      role: "member",
      serviceId: "svc-minarah",
    });
    // Trying to peek at another service's children
    await GET(
      createRequest("GET", "/api/children?serviceId=svc-other"),
    );
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("__no_access__");
  });

  it("member passing ?serviceId= for their OWN service is allowed (narrows correctly)", async () => {
    mockSession({
      id: "u-nadia",
      name: "Nadia",
      role: "member",
      serviceId: "svc-minarah",
    });
    await GET(
      createRequest("GET", "/api/children?serviceId=svc-minarah"),
    );
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-minarah");
  });

  it("coordinator sees their assigned service AND any services they manage", async () => {
    mockSession({
      id: "u-coord",
      name: "Coord",
      role: "coordinator",
      serviceId: "svc-a",
    });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-a" },
      { id: "svc-b" },
    ] as never);
    await GET(createRequest("GET", "/api/children"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    // Multiple ids → { in: [...] }
    expect(call.where.serviceId).toEqual({ in: ["svc-a", "svc-b"] });
  });

  it("owner passing ?serviceId= passes through (admin-tier override)", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    await GET(createRequest("GET", "/api/children?serviceId=svc-x"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-x");
  });
});

// ── 2026-04-29: status="current" widening regression ────────────────
describe("GET /api/children — status=current widened to active+pending", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    setupActiveUser();
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
  });

  it("status=current → where.status = { in: ['active', 'pending'] }", async () => {
    await GET(createRequest("GET", "/api/children?status=current"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["active", "pending"] });
  });

  it("status=all → no status filter", async () => {
    await GET(createRequest("GET", "/api/children?status=all"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
  });

  it("status=withdrawn → exact match (unchanged behaviour)", async () => {
    await GET(createRequest("GET", "/api/children?status=withdrawn"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.status).toBe("withdrawn");
  });

  it("status=pending alone → exact match (lets admins see only pending)", async () => {
    await GET(createRequest("GET", "/api/children?status=pending"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.status).toBe("pending");
  });
});
