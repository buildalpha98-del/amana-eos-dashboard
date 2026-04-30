/**
 * Centre-scope enforcement on the service detail route.
 *
 * Regression coverage for the 2026-04-29 confidentiality bug — until then,
 * GET /api/services/[id] had no scope filter, so any authenticated user
 * could fetch any centre's full payload (todos, issues, projects, rocks,
 * counts). Members and staff therefore got a complete cross-service data
 * dump just by typing a UUID into the URL.
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

import { GET } from "@/app/api/services/[id]/route";

const ctx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

const mockService = {
  id: "svc-minarah",
  name: "Amana OSHC Minarah",
  todos: [],
  issues: [],
  projects: [],
  rocks: [],
  _count: { todos: 0, issues: 0, projects: 0, rocks: 0, measurables: 0 },
};

describe("GET /api/services/[id] — centre scope", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.service.findUnique.mockResolvedValue(mockService as never);
    prismaMock.service.findMany.mockResolvedValue([]);
  });

  it("owner can fetch any service", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    const res = await GET(
      createRequest("GET", "/api/services/svc-minarah"),
      ctx({ id: "svc-minarah" }),
    );
    expect(res.status).toBe(200);
  });

  it("admin can fetch any service", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/services/svc-minarah"),
      ctx({ id: "svc-minarah" }),
    );
    expect(res.status).toBe(200);
  });

  it("member can fetch their assigned service", async () => {
    mockSession({
      id: "u-nadia",
      name: "Nadia",
      role: "member",
      serviceId: "svc-minarah",
    });
    const res = await GET(
      createRequest("GET", "/api/services/svc-minarah"),
      ctx({ id: "svc-minarah" }),
    );
    expect(res.status).toBe(200);
  });

  it("member is forbidden from another service (403, not data leak)", async () => {
    mockSession({
      id: "u-nadia",
      name: "Nadia",
      role: "member",
      serviceId: "svc-minarah",
    });
    const res = await GET(
      createRequest("GET", "/api/services/svc-other-centre"),
      ctx({ id: "svc-other-centre" }),
    );
    expect(res.status).toBe(403);
    // Confirm we never even hit the DB lookup — early forbidden short-circuits.
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
  });

  it("staff is forbidden from a service that's not theirs", async () => {
    mockSession({
      id: "u-staff",
      name: "Staff",
      role: "staff",
      serviceId: "svc-arkana",
    });
    const res = await GET(
      createRequest("GET", "/api/services/svc-minarah"),
      ctx({ id: "svc-minarah" }),
    );
    expect(res.status).toBe(403);
  });

  it("coordinator can fetch any service they manage", async () => {
    mockSession({
      id: "u-coord",
      name: "Coord",
      role: "member",
      serviceId: "svc-a",
    });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-a" },
      { id: "svc-b" },
    ] as never);
    const res = await GET(
      createRequest("GET", "/api/services/svc-b"),
      ctx({ id: "svc-b" }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 for a missing service the viewer IS allowed to see", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await GET(
      createRequest("GET", "/api/services/missing"),
      ctx({ id: "missing" }),
    );
    expect(res.status).toBe(404);
  });
});
