import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

import { POST } from "@/app/api/todos/bulk-actions/route";

describe("POST /api/todos/bulk-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/todos/bulk-actions", {
      body: { action: "complete", ids: ["t1"] },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("delete soft-deletes (updateMany deleted:true) and writes one ActivityLog", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.todo.findMany.mockResolvedValue([
      { id: "t1", rockId: null },
      { id: "t2", rockId: null },
    ]);
    prismaMock.todo.updateMany.mockResolvedValue({ count: 2 });

    const req = createRequest("POST", "/api/todos/bulk-actions", {
      body: { action: "delete", ids: ["t1", "t2"] },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prismaMock.todo.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.todo.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2"] } },
      data: { deleted: true },
    });
    expect(prismaMock.activityLog.create).toHaveBeenCalledTimes(1);
    const logArg = prismaMock.activityLog.create.mock.calls[0][0] as {
      data: { action: string; details: { ids: string[]; count: number } };
    };
    expect(logArg.data.action).toBe("bulk_delete");
    expect(logArg.data.details.ids).toEqual(["t1", "t2"]);
    expect(logArg.data.details.count).toBe(2);
  });

  it("delete only targets non-deleted todos", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.todo.findMany.mockResolvedValue([{ id: "t1", rockId: null }]);
    prismaMock.todo.updateMany.mockResolvedValue({ count: 1 });

    const req = createRequest("POST", "/api/todos/bulk-actions", {
      body: { action: "delete", ids: ["t1", "t-already-deleted"] },
    });
    await POST(req);

    expect(prismaMock.todo.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t-already-deleted"] }, deleted: false },
      select: { id: true, rockId: true },
    });
  });

  it("complete recomputes progress for each affected rock", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.todo.findMany
      // 1st call: bulk-action validation lookup
      .mockResolvedValueOnce([
        { id: "t1", rockId: "rock-a" },
        { id: "t2", rockId: "rock-a" },
        { id: "t3", rockId: "rock-b" },
        { id: "t4", rockId: null },
      ])
      // subsequent calls: recompute helper reading each rock's todos
      .mockResolvedValue([{ status: "complete" }]);
    prismaMock.todo.updateMany.mockResolvedValue({ count: 4 });
    prismaMock.rock.update.mockResolvedValue({});

    const req = createRequest("POST", "/api/todos/bulk-actions", {
      body: { action: "complete", ids: ["t1", "t2", "t3", "t4"] },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prismaMock.rock.update).toHaveBeenCalledTimes(2);
    const updatedIds = prismaMock.rock.update.mock.calls.map(
      (c: unknown[]) => (c[0] as { where: { id: string } }).where.id,
    );
    expect(updatedIds.sort()).toEqual(["rock-a", "rock-b"]);
  });

  it("complete without rock-linked todos skips recompute", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.todo.findMany.mockResolvedValue([{ id: "t1", rockId: null }]);
    prismaMock.todo.updateMany.mockResolvedValue({ count: 1 });

    const req = createRequest("POST", "/api/todos/bulk-actions", {
      body: { action: "complete", ids: ["t1"] },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prismaMock.rock.update).not.toHaveBeenCalled();
  });

  it("404s when no valid todos found", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.todo.findMany.mockResolvedValue([]);

    const req = createRequest("POST", "/api/todos/bulk-actions", {
      body: { action: "delete", ids: ["nope"] },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
