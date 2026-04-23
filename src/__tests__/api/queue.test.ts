import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/centre-scope", () => ({
  getCentreScope: vi.fn(async () => ({ serviceIds: null })),
}));

import { GET } from "@/app/api/queue/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { getCentreScope } from "@/lib/centre-scope";

describe("GET /api/queue", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "member" });
    vi.mocked(getCentreScope).mockResolvedValue({ serviceIds: null });

    prismaMock.coworkReport.findMany.mockResolvedValue([]);
    prismaMock.coworkTodo.findMany.mockResolvedValue([]);
    prismaMock.coworkReport.count.mockResolvedValue(0);
    prismaMock.coworkTodo.count.mockResolvedValue(0);
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/queue");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("my-queue default: scopes reports + todos to the current user", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    const todoCall = prismaMock.coworkTodo.findMany.mock.calls[0][0];
    expect(reportCall.where).toMatchObject({ assignedToId: "u1" });
    expect(todoCall.where).toMatchObject({ assignedToId: "u1" });
  });

  it("defaults status filter to 'pending' on reports when not supplied", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue");
    await GET(req);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    expect(reportCall.where.status).toBe("pending");
  });

  it("view=all for owner admin returns all reports/todos (no assignedToId filter)", async () => {
    mockSession({ id: "admin-1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin-1", active: true, role: "owner" });

    const req = createRequest("GET", "/api/queue?view=all");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    const todoCall = prismaMock.coworkTodo.findMany.mock.calls[0][0];
    expect(reportCall.where.assignedToId).toBeUndefined();
    expect(todoCall.where.assignedToId).toBeUndefined();
    // Admin view should include assignedTo in includes
    expect(reportCall.include.assignedTo).toBeDefined();
  });

  it("view=all for non-admin is ignored — still scoped to user", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue?view=all");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    const todoCall = prismaMock.coworkTodo.findMany.mock.calls[0][0];
    expect(reportCall.where.assignedToId).toBe("u1");
    expect(todoCall.where.assignedToId).toBe("u1");
  });

  it("applies seat filter to report where clause", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue?seat=coordinator");
    await GET(req);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    expect(reportCall.where.seat).toBe("coordinator");
  });

  it("applies serviceCode filter to both reports and todos", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue?serviceCode=AMC");
    await GET(req);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    const todoCall = prismaMock.coworkTodo.findMany.mock.calls[0][0];
    expect(reportCall.where.serviceCode).toBe("AMC");
    expect(todoCall.where.centreId).toBe("AMC");
  });

  it("applies explicit status filter to reports", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue?status=completed");
    await GET(req);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    expect(reportCall.where.status).toBe("completed");
  });

  it("status=all removes the default pending filter and shows all todos", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue?status=all");
    await GET(req);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    const todoCall = prismaMock.coworkTodo.findMany.mock.calls[0][0];
    // Reports: status should not be set (only pending is the default)
    expect(reportCall.where.status).toBeUndefined();
    // Todos: completed filter should not be applied when status=all
    expect(todoCall.where.completed).toBeUndefined();
  });

  it("honours limit query param (capped at 100)", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue?limit=25");
    await GET(req);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    expect(reportCall.take).toBe(25);
  });

  it("caps limit at 100 even when larger value requested", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue?limit=500");
    await GET(req);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    expect(reportCall.take).toBe(100);
  });

  it("honours offset query param for pagination", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/queue?offset=20");
    await GET(req);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    expect(reportCall.skip).toBe(20);
  });

  it("returns reports + todos + counts in response body", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });
    prismaMock.coworkReport.findMany.mockResolvedValue([
      { id: "r1", title: "Daily checklist", service: { id: "s1", name: "Centre A", code: "A" } },
    ]);
    prismaMock.coworkTodo.findMany.mockResolvedValue([
      { id: "t1", title: "Follow up", completed: false },
    ]);
    prismaMock.coworkReport.count.mockResolvedValue(1);
    prismaMock.coworkTodo.count.mockResolvedValue(1);

    const req = createRequest("GET", "/api/queue");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reports).toHaveLength(1);
    expect(data.todos).toHaveLength(1);
    expect(data.counts).toEqual({ reports: 1, todos: 1 });
  });

  it("admin viewing all with centre scope: restricts by service codes", async () => {
    mockSession({ id: "admin-1", name: "Coord Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin-1", active: true, role: "admin" });
    // Admin with a scoped subset of services
    vi.mocked(getCentreScope).mockResolvedValue({ serviceIds: ["svc-1", "svc-2"] });
    prismaMock.service.findMany.mockResolvedValue([
      { code: "AMC" },
      { code: "BRK" },
    ]);

    const req = createRequest("GET", "/api/queue?view=all");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    expect(reportCall.where.serviceCode).toEqual({ in: ["AMC", "BRK"] });
  });

  it("admin viewing all with empty centre scope: returns no-access marker", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin-1", active: true, role: "admin" });
    vi.mocked(getCentreScope).mockResolvedValue({ serviceIds: [] });
    prismaMock.service.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/queue?view=all");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const reportCall = prismaMock.coworkReport.findMany.mock.calls[0][0];
    expect(reportCall.where.serviceCode).toBe("__no_access__");
  });
});
