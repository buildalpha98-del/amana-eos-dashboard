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
  buildCentreOrPersonalFilter: vi.fn(() => null),
  applyCentreFilter: vi.fn(),
}));

// Mock pagination
vi.mock("@/lib/pagination", () => ({
  parsePagination: vi.fn(() => null),
}));

// Mock send-assignment-email
vi.mock("@/lib/send-assignment-email", () => ({
  sendAssignmentEmail: vi.fn(),
}));

import { GET, POST } from "@/app/api/todos/route";
import { GET as getTodo, PATCH, DELETE } from "@/app/api/todos/[id]/route";

describe("GET /api/todos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/todos");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns todos for authenticated user", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const mockTodos = [
      {
        id: "t1",
        title: "Review budget",
        status: "pending",
        assignee: { id: "user-1", name: "Test", email: "t@t.com", avatar: null },
        rock: null,
        issue: null,
        assignees: [],
      },
    ];
    prismaMock.todo.findMany.mockResolvedValue(mockTodos);

    const req = createRequest("GET", "/api/todos");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Review budget");
  });

  it("filters by status", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.todo.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/todos?status=complete");
    await GET(req);

    const callArgs = prismaMock.todo.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe("complete");
    expect(callArgs.where.deleted).toBe(false);
  });

  it("filters by assigneeId", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.todo.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/todos?assigneeId=user-2");
    await GET(req);

    const callArgs = prismaMock.todo.findMany.mock.calls[0][0];
    expect(callArgs.where.assigneeId).toBe("user-2");
  });

  it("filters by rockId", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.todo.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/todos?rockId=rock-1");
    await GET(req);

    const callArgs = prismaMock.todo.findMany.mock.calls[0][0];
    expect(callArgs.where.rockId).toBe("rock-1");
  });

  it("filters by serviceId", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.todo.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/todos?serviceId=svc-1");
    await GET(req);

    const callArgs = prismaMock.todo.findMany.mock.calls[0][0];
    expect(callArgs.where.serviceId).toBe("svc-1");
  });
});

describe("POST /api/todos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/todos", {
      body: { title: "Test", assigneeId: "u1", dueDate: "2026-04-01", weekOf: "2026-03-30" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    const req = createRequest("POST", "/api/todos", {
      body: { assigneeId: "u1", dueDate: "2026-04-01", weekOf: "2026-03-30" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when assigneeId is missing", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    const req = createRequest("POST", "/api/todos", {
      body: { title: "Test Todo", dueDate: "2026-04-01", weekOf: "2026-03-30" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when dueDate is missing", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    const req = createRequest("POST", "/api/todos", {
      body: { title: "Test Todo", assigneeId: "u1", weekOf: "2026-03-30" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates todo with valid data", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const createdTodo = {
      id: "t-new",
      title: "New Todo",
      status: "pending",
      assigneeId: "user-2",
      assignee: { id: "user-2", name: "Assignee", email: "a@t.com", avatar: null },
      rock: null,
      issue: null,
      assignees: [],
    };
    prismaMock.todo.create.mockResolvedValue(createdTodo);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/todos", {
      body: {
        title: "New Todo",
        assigneeId: "user-2",
        dueDate: "2026-04-01",
        weekOf: "2026-03-30",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("New Todo");
  });
});

describe("GET /api/todos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/todos/t1");
    const context = { params: Promise.resolve({ id: "t1" }) };
    const res = await getTodo(req, context);
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent todo", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.todo.findUnique.mockResolvedValue(null);

    const req = createRequest("GET", "/api/todos/unknown");
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await getTodo(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns todo for valid ID", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    const mockTodo = {
      id: "t1",
      title: "Review budget",
      status: "pending",
      assignee: { id: "user-1", name: "Test", email: "t@t.com", avatar: null },
      rock: null,
      issue: null,
    };
    prismaMock.todo.findUnique.mockResolvedValue(mockTodo);

    const req = createRequest("GET", "/api/todos/t1");
    const context = { params: Promise.resolve({ id: "t1" }) };
    const res = await getTodo(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Review budget");
  });
});

describe("PATCH /api/todos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 404 for non-existent todo", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.todo.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/todos/unknown", { body: { title: "Updated" } });
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(404);
  });

  it("updates todo status", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.todo.findUnique.mockResolvedValue({ id: "t1", status: "pending", assigneeId: "user-1" });

    const updatedTodo = {
      id: "t1",
      title: "Review budget",
      status: "complete",
      rockId: null,
      assignee: { id: "user-1", name: "Test", email: "t@t.com", avatar: null },
      rock: null,
      issue: null,
    };
    prismaMock.todo.update.mockResolvedValue(updatedTodo);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/todos/t1", { body: { status: "complete" } });
    const context = { params: Promise.resolve({ id: "t1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("complete");
  });

  it("returns 400 for invalid status value", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.todo.findUnique.mockResolvedValue({ id: "t1", status: "pending" });

    const req = createRequest("PATCH", "/api/todos/t1", { body: { status: "invalid_status" } });
    const context = { params: Promise.resolve({ id: "t1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/todos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("soft-deletes a todo", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.todo.update.mockResolvedValue({ id: "t1", deleted: true });
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("DELETE", "/api/todos/t1");
    const context = { params: Promise.resolve({ id: "t1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
