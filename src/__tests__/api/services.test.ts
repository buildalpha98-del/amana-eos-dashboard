import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock service-scope
vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));

// Mock centre-scope
vi.mock("@/lib/centre-scope", () => ({
  getCentreScope: vi.fn(() => ({ serviceIds: null })),
  applyCentreFilter: vi.fn(),
}));

// Mock pagination
vi.mock("@/lib/pagination", () => ({
  parsePagination: vi.fn(() => null),
}));

// Mock api-error (used by services/[id])
vi.mock("@/lib/api-error", async () => {
  const actual = await vi.importActual("@/lib/api-error");
  return actual;
});

// Mock logger + rate limit
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));

import { GET, POST } from "@/app/api/services/route";
import { GET as getService, PATCH, DELETE } from "@/app/api/services/[id]/route";

describe("GET /api/services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/services");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns services list", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const mockServices = [
      {
        id: "svc-1",
        name: "Centre Alpha",
        code: "CA",
        status: "active",
        manager: { id: "u1", name: "Manager", email: "m@t.com", avatar: null },
        _count: { todos: 5, issues: 2, projects: 1 },
      },
      {
        id: "svc-2",
        name: "Centre Beta",
        code: "CB",
        status: "active",
        manager: null,
        _count: { todos: 0, issues: 0, projects: 0 },
      },
    ];
    prismaMock.service.findMany.mockResolvedValue(mockServices);

    const req = createRequest("GET", "/api/services");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Centre Alpha");
    expect(body[0]._count.todos).toBe(5);
  });

  it("filters by status", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/services?status=active");
    await GET(req);

    const callArgs = prismaMock.service.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe("active");
  });

  it("includes manager in response", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/services");
    await GET(req);

    const callArgs = prismaMock.service.findMany.mock.calls[0][0];
    expect(callArgs.include.manager).toBeDefined();
  });
});

describe("POST /api/services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/services", {
      body: { name: "Test", code: "TST" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for unauthorized roles", async () => {
    mockSession({ id: "user-1", name: "Member", role: "member" });
    const req = createRequest("POST", "/api/services", {
      body: { name: "Test", code: "TST" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/services", {
      body: { code: "TST" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is missing", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/services", {
      body: { name: "Test" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate service code", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findFirst.mockResolvedValue({ id: "existing" });

    const req = createRequest("POST", "/api/services", {
      body: { name: "Test", code: "DUP" },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already exists");
  });

  it("creates service with valid data", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findFirst.mockResolvedValue(null);

    const createdService = {
      id: "svc-new",
      name: "New Centre",
      code: "NC",
      status: "active",
      manager: null,
    };
    prismaMock.service.create.mockResolvedValue(createdService);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/services", {
      body: { name: "New Centre", code: "NC" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("New Centre");
    expect(body.code).toBe("NC");
  });
});

describe("GET /api/services/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/services/svc-1");
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await getService(req, context);
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent service", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue(null);

    const req = createRequest("GET", "/api/services/unknown");
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await getService(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns service with includes for valid ID", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const mockService = {
      id: "svc-1",
      name: "Centre Alpha",
      code: "CA",
      manager: { id: "u1", name: "Manager", email: "m@t.com", avatar: null },
      todos: [],
      issues: [],
      projects: [],
      rocks: [],
      _count: { todos: 0, issues: 0, projects: 0, rocks: 0, measurables: 0 },
    };
    prismaMock.service.findUnique.mockResolvedValue(mockService);

    const req = createRequest("GET", "/api/services/svc-1");
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await getService(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Centre Alpha");
    expect(body._count).toBeDefined();
  });
});

describe("PATCH /api/services/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 403 for unauthorized roles", async () => {
    mockSession({ id: "user-1", name: "Member", role: "member" });
    const req = createRequest("PATCH", "/api/services/svc-1", { body: { name: "Updated" } });
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent service", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/services/unknown", { body: { name: "Updated" } });
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(404);
  });

  it("updates service name", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });

    const updatedService = {
      id: "svc-1",
      name: "Updated Centre",
      code: "UC",
      manager: null,
    };
    prismaMock.service.update.mockResolvedValue(updatedService);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/services/svc-1", { body: { name: "Updated Centre" } });
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Centre");
  });

  // ── Approvals + session times (Commit 2) ────────────────────────
  it("accepts serviceApprovalNumber, providerApprovalNumber, and valid sessionTimes", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
    const updated = {
      id: "svc-1",
      name: "Centre",
      serviceApprovalNumber: "SE-00012345",
      providerApprovalNumber: "PR-00067890",
      sessionTimes: { bsc: { start: "06:30", end: "08:45" } },
      manager: null,
    };
    prismaMock.service.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/services/svc-1", {
      body: {
        serviceApprovalNumber: "SE-00012345",
        providerApprovalNumber: "PR-00067890",
        sessionTimes: { bsc: { start: "06:30", end: "08:45" } },
      },
    });
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    const updateCall = prismaMock.service.update.mock.calls[0][0];
    expect(updateCall.data.serviceApprovalNumber).toBe("SE-00012345");
    expect(updateCall.data.providerApprovalNumber).toBe("PR-00067890");
    expect(updateCall.data.sessionTimes).toEqual({ bsc: { start: "06:30", end: "08:45" } });
  });

  it("rejects sessionTimes with non-HH:MM start (e.g. '6:30') with 400", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });

    const req = createRequest("PATCH", "/api/services/svc-1", {
      body: { sessionTimes: { bsc: { start: "6:30", end: "08:45" } } },
    });
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(400);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });

  it("rejects sessionTimes with non-time string with 400", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });

    const req = createRequest("PATCH", "/api/services/svc-1", {
      body: { sessionTimes: { bsc: { start: "not-a-time", end: "08:45" } } },
    });
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(400);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });

  // ── Coordinator service-scope narrowing ─────────────────────────
  it("allows coordinator to patch approval fields on their own service (200)", async () => {
    mockSession({
      id: "coord-1",
      name: "Coordinator",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
    const updated = {
      id: "svc-1",
      name: "Centre",
      serviceApprovalNumber: "SE-00099999",
      providerApprovalNumber: "PR-00088888",
      manager: null,
    };
    prismaMock.service.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/services/svc-1", {
      body: {
        serviceApprovalNumber: "SE-00099999",
        providerApprovalNumber: "PR-00088888",
      },
    });
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    expect(prismaMock.service.update).toHaveBeenCalledTimes(1);
    const updateCall = prismaMock.service.update.mock.calls[0][0];
    expect(updateCall.data.serviceApprovalNumber).toBe("SE-00099999");
    expect(updateCall.data.providerApprovalNumber).toBe("PR-00088888");
  });

  it("forbids coordinator from patching another service (403), no update called", async () => {
    mockSession({
      id: "coord-1",
      name: "Coordinator",
      role: "member",
      serviceId: "svc-other",
    });

    const req = createRequest("PATCH", "/api/services/svc-1", {
      body: { serviceApprovalNumber: "SE-00099999" },
    });
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(403);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/services/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 403 for unauthorized roles", async () => {
    mockSession({ id: "user-1", name: "Member", role: "member" });
    const req = createRequest("DELETE", "/api/services/svc-1");
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent service", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue(null);

    const req = createRequest("DELETE", "/api/services/unknown");
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(404);
  });

  it("deletes service successfully", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1", name: "Centre" });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.service.delete.mockResolvedValue({});

    const req = createRequest("DELETE", "/api/services/svc-1");
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
