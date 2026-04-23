import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { POST } from "@/app/api/issues/bulk/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("POST /api/issues/bulk", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("401 unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "resolve", ids: ["i1"] },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("400 on invalid action", async () => {
    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "yeet", ids: ["i1"] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 on empty ids array", async () => {
    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "resolve", ids: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 when assign action is missing assigneeId", async () => {
    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "assign", ids: ["i1", "i2"] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/assigneeId/i);
  });

  it("400 when move action is missing category", async () => {
    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "move", ids: ["i1"] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/category/i);
  });

  it("400 when move action has invalid category", async () => {
    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "move", ids: ["i1"], category: "random_bucket" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("resolve → updateMany sets status=solved with solvedAt", async () => {
    prismaMock.issue.updateMany.mockResolvedValue({ count: 2 });

    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "resolve", ids: ["i1", "i2"] },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);

    const call = prismaMock.issue.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: { in: ["i1", "i2"] }, deleted: false });
    expect(call.data.status).toBe("solved");
    expect(call.data.solvedAt).toBeInstanceOf(Date);
  });

  it("delete → updateMany soft-deletes", async () => {
    prismaMock.issue.updateMany.mockResolvedValue({ count: 3 });

    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "delete", ids: ["i1", "i2", "i3"] },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.count).toBe(3);

    const call = prismaMock.issue.updateMany.mock.calls[0][0];
    expect(call.data.deleted).toBe(true);
  });

  it("assign → updateMany sets ownerId when assigneeId provided", async () => {
    prismaMock.issue.updateMany.mockResolvedValue({ count: 2 });

    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "assign", ids: ["i1", "i2"], assigneeId: "u2" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const call = prismaMock.issue.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: { in: ["i1", "i2"] }, deleted: false });
    expect(call.data.ownerId).toBe("u2");
  });

  it("move → updateMany sets category when valid", async () => {
    prismaMock.issue.updateMany.mockResolvedValue({ count: 1 });

    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "move", ids: ["i1"], category: "long_term" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const call = prismaMock.issue.updateMany.mock.calls[0][0];
    expect(call.data.category).toBe("long_term");
  });

  it("records an activity log entry for each bulk action", async () => {
    prismaMock.issue.updateMany.mockResolvedValue({ count: 2 });

    const req = createRequest("POST", "/api/issues/bulk", {
      body: { action: "resolve", ids: ["i1", "i2"] },
    });
    await POST(req);

    expect(prismaMock.activityLog.create).toHaveBeenCalledTimes(1);
    const logCall = prismaMock.activityLog.create.mock.calls[0][0];
    expect(logCall.data.action).toBe("bulk_resolve");
    expect(logCall.data.entityType).toBe("Issue");
    expect(logCall.data.details.ids).toEqual(["i1", "i2"]);
  });
});
