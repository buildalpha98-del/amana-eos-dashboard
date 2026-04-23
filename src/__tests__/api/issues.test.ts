import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

// Scope helpers — owner/admin get no scope restrictions
vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/centre-scope", () => ({
  getCentreScope: vi.fn(async () => ({ serviceIds: null })),
  buildCentreOrPersonalFilter: vi.fn(() => null),
  applyCentreFilter: vi.fn(),
}));

// Pagination — default to null (un-paginated)
vi.mock("@/lib/pagination", () => ({
  parsePagination: vi.fn(() => null),
}));

// Fire-and-forget side effects
vi.mock("@/lib/teams-notify", () => ({
  notifyNewIssue: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/send-assignment-email", () => ({
  sendAssignmentEmail: vi.fn(),
}));

import { GET, POST } from "@/app/api/issues/route";
import { PATCH, DELETE } from "@/app/api/issues/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/issues", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/issues");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns list of issues for authenticated user", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const mockIssues = [
      {
        id: "i1",
        title: "Server outage",
        priority: "critical",
        status: "open",
        raisedBy: { id: "u1", name: "Owner", email: "o@t.com", avatar: null },
        owner: null,
        rock: null,
        service: null,
        _count: { spawnedTodos: 0 },
      },
    ];
    prismaMock.issue.findMany.mockResolvedValue(mockIssues);

    const req = createRequest("GET", "/api/issues");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Server outage");
  });

  it("filters by status", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.issue.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/issues?status=open");
    await GET(req);

    const callArgs = prismaMock.issue.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe("open");
    expect(callArgs.where.deleted).toBe(false);
  });

  it("filters by comma-separated statuses using IN", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.issue.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/issues?status=open,in_discussion");
    await GET(req);

    const callArgs = prismaMock.issue.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toEqual({ in: ["open", "in_discussion"] });
  });

  it("filters by priority, ownerId, rockId, serviceId", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.issue.findMany.mockResolvedValue([]);

    const req = createRequest(
      "GET",
      "/api/issues?priority=high&ownerId=u2&rockId=r1&serviceId=s1"
    );
    await GET(req);

    const callArgs = prismaMock.issue.findMany.mock.calls[0][0];
    expect(callArgs.where.priority).toBe("high");
    expect(callArgs.where.ownerId).toBe("u2");
    expect(callArgs.where.rockId).toBe("r1");
    expect(callArgs.where.serviceId).toBe("s1");
  });
});

describe("POST /api/issues", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/issues", {
      body: { title: "Test" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/issues", { body: { priority: "high" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when title is empty string", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/issues", { body: { title: "" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when priority is invalid", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/issues", {
      body: { title: "Valid", priority: "super_urgent" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates an issue with valid data and returns 201", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });

    const createdIssue = {
      id: "i-new",
      title: "Cover shift",
      priority: "medium",
      status: "open",
      raisedBy: { id: "u1", name: "Owner", email: "o@t.com", avatar: null },
      owner: null,
      rock: null,
      _count: { spawnedTodos: 0 },
    };
    prismaMock.issue.create.mockResolvedValue(createdIssue);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/issues", {
      body: { title: "Cover shift", priority: "medium" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Cover shift");

    // Writes activity log
    expect(prismaMock.activityLog.create).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/issues/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/issues/i1", { body: { title: "Updated" } });
    const context = { params: Promise.resolve({ id: "i1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent issue", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.issue.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/issues/unknown", { body: { title: "X" } });
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 400 for invalid status value", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.issue.findUnique.mockResolvedValue({ id: "i1", status: "open" });

    const req = createRequest("PATCH", "/api/issues/i1", { body: { status: "bogus" } });
    const context = { params: Promise.resolve({ id: "i1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(400);
  });

  it("updates status and records solvedAt when moving to solved", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.issue.findUnique.mockResolvedValue({
      id: "i1",
      status: "in_discussion",
      discussedAt: new Date(),
      solvedAt: null,
      ownerId: null,
    });

    const updated = {
      id: "i1",
      title: "Fixed",
      status: "solved",
      priority: "medium",
      raisedBy: { id: "u1", name: "Owner", email: "o@t.com", avatar: null },
      owner: null,
      rock: null,
      _count: { spawnedTodos: 0 },
    };
    prismaMock.issue.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/issues/i1", { body: { status: "solved" } });
    const context = { params: Promise.resolve({ id: "i1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);

    const updateCall = prismaMock.issue.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("solved");
    expect(updateCall.data.solvedAt).toBeInstanceOf(Date);
  });

  it("updates status and records discussedAt when moving to in_discussion (first time)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.issue.findUnique.mockResolvedValue({
      id: "i1",
      status: "open",
      discussedAt: null,
      solvedAt: null,
      ownerId: null,
    });

    prismaMock.issue.update.mockResolvedValue({
      id: "i1",
      title: "Under review",
      status: "in_discussion",
      priority: "medium",
      raisedBy: { id: "u1", name: "Owner", email: "o@t.com", avatar: null },
      owner: null,
      rock: null,
      _count: { spawnedTodos: 0 },
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/issues/i1", {
      body: { status: "in_discussion" },
    });
    const context = { params: Promise.resolve({ id: "i1" }) };
    await PATCH(req, context);

    const updateCall = prismaMock.issue.update.mock.calls[0][0];
    expect(updateCall.data.discussedAt).toBeInstanceOf(Date);
  });
});

describe("DELETE /api/issues/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("DELETE", "/api/issues/i1");
    const context = { params: Promise.resolve({ id: "i1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(401);
  });

  it("soft-deletes an issue", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.issue.update.mockResolvedValue({ id: "i1", deleted: true });
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("DELETE", "/api/issues/i1");
    const context = { params: Promise.resolve({ id: "i1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const call = prismaMock.issue.update.mock.calls[0][0];
    expect(call.data.deleted).toBe(true);
  });
});
