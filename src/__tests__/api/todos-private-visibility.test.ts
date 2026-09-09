import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { privateTodoWhereFor } from "@/lib/todos/private-filter";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));

vi.mock("@/lib/centre-scope", () => ({
  getCentreScope: vi.fn(() => ({ serviceIds: null })),
  buildCentreOrPersonalFilter: vi.fn(() => null),
  applyCentreFilter: vi.fn(),
}));

vi.mock("@/lib/pagination", () => ({
  parsePagination: vi.fn(() => null),
}));

vi.mock("@/lib/send-assignment-email", () => ({
  sendAssignmentEmail: vi.fn(),
}));

import { GET as listTodos } from "@/app/api/todos/route";
import { GET as getTodo, PATCH as patchTodo } from "@/app/api/todos/[id]/route";
import { GET as searchGet } from "@/app/api/search/route";
import { GET as todayGet } from "@/app/api/services/[id]/today/route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("isPrivate enforcement — GET /api/todos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("AND-composes the private clause for non-admin roles", async () => {
    mockSession({ id: "u2", name: "Member", role: "member" });
    prismaMock.todo.findMany.mockResolvedValue([]);

    await listTodos(createRequest("GET", "/api/todos"));

    const arg = prismaMock.todo.findMany.mock.calls[0][0] as {
      where: { AND?: unknown[] };
    };
    expect(arg.where.AND).toBeDefined();
    expect(arg.where.AND).toContainEqual(privateTodoWhereFor("member", "u2"));
  });

  it("applies no private clause for owner", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.todo.findMany.mockResolvedValue([]);

    await listTodos(createRequest("GET", "/api/todos"));

    const arg = prismaMock.todo.findMany.mock.calls[0][0] as {
      where: { AND?: unknown[] };
    };
    expect(arg.where.AND).toBeUndefined();
  });
});

describe("isPrivate enforcement — GET /api/todos/[id]", () => {
  const privateTodo = {
    id: "t1",
    title: "Secret",
    isPrivate: true,
    assigneeId: "u9",
    createdById: "u8",
    assignees: [{ userId: "u7" }],
    assignee: null,
    rock: null,
    issue: null,
    meeting: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.todo.findUnique.mockResolvedValue(privateTodo);
  });

  it("404s for an unrelated non-admin user", async () => {
    mockSession({ id: "u2", name: "Member", role: "member" });
    const res = await getTodo(
      createRequest("GET", "/api/todos/t1"),
      context("t1"),
    );
    expect(res.status).toBe(404);
  });

  it.each([
    ["assignee", "u9"],
    ["co-assignee", "u7"],
    ["creator", "u8"],
  ])("200s for the %s", async (_label, id) => {
    mockSession({ id, name: "X", role: "member" });
    const res = await getTodo(
      createRequest("GET", "/api/todos/t1"),
      context("t1"),
    );
    expect(res.status).toBe(200);
  });

  it("200s for admin-tier roles", async () => {
    mockSession({ id: "u2", name: "Admin", role: "admin" });
    const res = await getTodo(
      createRequest("GET", "/api/todos/t1"),
      context("t1"),
    );
    expect(res.status).toBe(200);
  });
});

describe("isPrivate enforcement — GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    for (const model of [
      "rock",
      "todo",
      "issue",
      "service",
      "project",
      "child",
      "lead",
      "parentEnquiry",
    ] as const) {
      prismaMock[model].findMany.mockResolvedValue([]);
    }
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  it("composes the private clause into the todo search for eos_viewer", async () => {
    mockSession({ id: "u3", name: "Viewer", role: "eos_viewer" });

    await searchGet(createRequest("GET", "/api/search?q=budget"));

    const arg = prismaMock.todo.findMany.mock.calls[0][0] as {
      where: { AND?: unknown[] };
    };
    expect(arg.where.AND).toContainEqual(privateTodoWhereFor("eos_viewer", "u3"));
  });
});

describe("isPrivate enforcement — GET /api/services/[id]/today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
    prismaMock.dailyAttendance.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.todo.findMany.mockResolvedValue([]);
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
  });

  it("composes the private clause into todosToday for non-admin roles", async () => {
    mockSession({ id: "u4", name: "Member", role: "member" });

    await todayGet(
      createRequest("GET", "/api/services/s1/today"),
      context("s1"),
    );

    const arg = prismaMock.todo.findMany.mock.calls[0][0] as {
      where: { AND?: unknown[] };
    };
    expect(arg.where.AND).toContainEqual(privateTodoWhereFor("member", "u4"));
  });
});

describe("isPrivate enforcement — PATCH /api/todos/[id]", () => {
  const privateTodo = {
    id: "t1",
    title: "Secret",
    isPrivate: true,
    assigneeId: "u9",
    createdById: "u8",
    rockId: null,
    assignees: [{ userId: "u7" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.todo.findUnique.mockResolvedValue(privateTodo);
    prismaMock.todo.update.mockResolvedValue({
      ...privateTodo,
      title: "Hacked",
      assignee: null,
      rock: null,
      issue: null,
      meeting: null,
    });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("404s for an unrelated non-admin user — PATCH must not leak or edit", async () => {
    mockSession({ id: "u2", name: "Member", role: "member" });
    const res = await patchTodo(
      createRequest("PATCH", "/api/todos/t1", { body: { title: "Hacked" } }),
      context("t1"),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.todo.update).not.toHaveBeenCalled();
  });

  it("200s for the assignee", async () => {
    mockSession({ id: "u9", name: "Assignee", role: "member" });
    const res = await patchTodo(
      createRequest("PATCH", "/api/todos/t1", { body: { title: "Renamed" } }),
      context("t1"),
    );
    expect(res.status).toBe(200);
  });
});
