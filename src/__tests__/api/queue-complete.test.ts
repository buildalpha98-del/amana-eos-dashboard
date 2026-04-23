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

import { POST } from "@/app/api/queue/[id]/complete/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const params = { params: Promise.resolve({ id: "todo-1" }) };

describe("POST /api/queue/[id]/complete", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "member" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/queue/todo-1/complete");
    const res = await POST(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 when todo does not exist", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });
    prismaMock.coworkTodo.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/queue/missing/complete");
    const res = await POST(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 200 and marks todo completed on happy path (assignee)", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });
    prismaMock.coworkTodo.findUnique.mockResolvedValue({
      id: "todo-1",
      title: "Follow up",
      assignedToId: "u1",
      completed: false,
    });
    prismaMock.coworkTodo.update.mockResolvedValue({
      id: "todo-1",
      title: "Follow up",
      assignedToId: "u1",
      completed: true,
      completedAt: new Date(),
      completedBy: "u1",
    });

    const req = createRequest("POST", "/api/queue/todo-1/complete");
    const res = await POST(req, params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.todo.id).toBe("todo-1");
    expect(body.todo.completed).toBe(true);

    const call = prismaMock.coworkTodo.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "todo-1" });
    expect(call.data.completed).toBe(true);
    expect(call.data.completedBy).toBe("u1");
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });

  it("stamps completedBy with the current user id", async () => {
    mockSession({ id: "user-42", name: "Another", role: "member" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-42", active: true, role: "member" });
    prismaMock.coworkTodo.findUnique.mockResolvedValue({
      id: "todo-1",
      assignedToId: "user-42",
      completed: false,
    });
    prismaMock.coworkTodo.update.mockResolvedValue({
      id: "todo-1",
      completed: true,
      completedBy: "user-42",
    });

    const req = createRequest("POST", "/api/queue/todo-1/complete");
    const res = await POST(req, params);
    expect(res.status).toBe(200);

    const call = prismaMock.coworkTodo.update.mock.calls[0][0];
    expect(call.data.completedBy).toBe("user-42");
  });

  it("returns 403 when caller is not the assignee (non-admin role)", async () => {
    mockSession({ id: "other-user", name: "Other", role: "member" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "other-user", active: true, role: "member" });
    prismaMock.coworkTodo.findUnique.mockResolvedValue({
      id: "todo-1",
      assignedToId: "someone-else",
      completed: false,
    });

    const req = createRequest("POST", "/api/queue/todo-1/complete");
    const res = await POST(req, params);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toMatch(/forbidden/i);
    // Ensure the update was NOT called — the 403 blocks it.
    expect(prismaMock.coworkTodo.update).not.toHaveBeenCalled();
  });

  it.each([
    ["owner"],
    ["head_office"],
    ["admin"],
  ])("role %s can complete a todo assigned to someone else (admin override)", async (role) => {
    mockSession({ id: "admin-user", name: "Admin", role: role as "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin-user", active: true, role });
    prismaMock.coworkTodo.findUnique.mockResolvedValue({
      id: "todo-1",
      assignedToId: "someone-else",
      completed: false,
    });
    prismaMock.coworkTodo.update.mockResolvedValue({
      id: "todo-1",
      completed: true,
      completedBy: "admin-user",
    });

    const req = createRequest("POST", "/api/queue/todo-1/complete");
    const res = await POST(req, params);
    expect(res.status).toBe(200);

    const call = prismaMock.coworkTodo.update.mock.calls[0][0];
    expect(call.data.completedBy).toBe("admin-user");
  });
});
