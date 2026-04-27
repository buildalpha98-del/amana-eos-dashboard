import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));
vi.mock("@/lib/send-assignment-email", () => ({
  sendAssignmentEmail: vi.fn(() => Promise.resolve()),
}));

import { GET, POST } from "@/app/api/marketing/coordinator-todos/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.activityLog.create.mockResolvedValue({ id: "log-1" });
});

describe("POST /api/marketing/coordinator-todos", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/marketing/coordinator-todos", {
        body: { title: "X", serviceIds: ["s-1"], dueDate: "2026-05-01" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("403 staff role", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await POST(
      createRequest("POST", "/api/marketing/coordinator-todos", {
        body: { title: "X", serviceIds: ["s-1"], dueDate: "2026-05-01" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 invalid body (no serviceIds)", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await POST(
      createRequest("POST", "/api/marketing/coordinator-todos", {
        body: { title: "X", serviceIds: [], dueDate: "2026-05-01" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when one of the serviceIds is unknown", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([{ id: "s-1", name: "Centre A", managerId: null }]);
    const res = await POST(
      createRequest("POST", "/api/marketing/coordinator-todos", {
        body: { title: "X", serviceIds: ["s-1", "missing"], dueDate: "2026-05-01" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("happy path: assigns to coordinator and creates one todo per service", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "s-1", name: "Centre A", managerId: "mgr-1" },
      { id: "s-2", name: "Centre B", managerId: "mgr-2" },
    ]);
    // resolveCoordinatorForService → user.findFirst
    prismaMock.user.findFirst.mockImplementation((args: any) => {
      if (args?.where?.serviceId === "s-1") {
        return Promise.resolve({ id: "coord-1", name: "Sara", email: "s@x.com", phone: null });
      }
      return Promise.resolve(null); // Centre B falls back to manager
    });
    prismaMock.todo.create
      .mockResolvedValueOnce({ id: "t-1", title: "X", assignee: { id: "coord-1", name: "Sara" } })
      .mockResolvedValueOnce({ id: "t-2", title: "X", assignee: { id: "mgr-2", name: "Manager B" } });

    const res = await POST(
      createRequest("POST", "/api/marketing/coordinator-todos", {
        body: { title: "Promote Open Day", serviceIds: ["s-1", "s-2"], dueDate: "2026-05-01" },
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.created).toHaveLength(2);
    expect(data.created[0].assigneeId).toBe("coord-1");
    expect(data.created[1].assigneeId).toBe("mgr-2");
    expect(data.skipped).toEqual([]);
    expect(prismaMock.todo.create).toHaveBeenCalledTimes(2);
  });

  it("skips a centre when no coordinator/manager/fallback assignee exists", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "s-1", name: "Centre A", managerId: null },
    ]);
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/marketing/coordinator-todos", {
        body: { title: "X", serviceIds: ["s-1"], dueDate: "2026-05-01" },
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.created).toEqual([]);
    expect(data.skipped).toHaveLength(1);
    expect(data.skipped[0].reason).toMatch(/No coordinator/);
  });

  it("appends activation context to description when activationId provided", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([{ id: "s-1", name: "Centre A", managerId: "mgr-1" }]);
    prismaMock.user.findFirst.mockResolvedValue({ id: "coord-1", name: "Sara", email: "s@x.com", phone: null });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      serviceId: "s-1",
      campaign: { name: "Open Day" },
    });
    prismaMock.todo.create.mockResolvedValue({ id: "t-1", title: "Promote", assignee: { id: "coord-1", name: "Sara" } });
    const res = await POST(
      createRequest("POST", "/api/marketing/coordinator-todos", {
        body: { title: "Promote", description: "Send WhatsApp reminders", serviceIds: ["s-1"], dueDate: "2026-05-01", activationId: "a-1" },
      }),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.todo.create.mock.calls[0][0];
    expect(createArg.data.description).toContain("Send WhatsApp reminders");
    expect(createArg.data.description).toContain("Marketing context: Open Day");
  });

  it("rejects unknown activationId", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([{ id: "s-1", name: "Centre A", managerId: "mgr-1" }]);
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/marketing/coordinator-todos", {
        body: { title: "X", serviceIds: ["s-1"], dueDate: "2026-05-01", activationId: "missing" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/marketing/coordinator-todos", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/marketing/coordinator-todos"));
    expect(res.status).toBe(401);
  });

  it("returns todos created by current user with serviceId set", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.todo.findMany.mockResolvedValue([
      {
        id: "t-1",
        title: "Promote",
        description: "...",
        status: "pending",
        dueDate: new Date("2026-05-01"),
        completedAt: null,
        createdAt: new Date(),
        assignee: { id: "coord-1", name: "Sara" },
        service: { id: "s-1", name: "Centre A", code: "AAA" },
      },
    ]);
    const res = await GET(createRequest("GET", "/api/marketing/coordinator-todos"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.todos).toHaveLength(1);
    expect(data.todos[0].service.name).toBe("Centre A");
    const findArgs = prismaMock.todo.findMany.mock.calls[0][0];
    expect(findArgs.where.createdById).toBe("akram");
    expect(findArgs.where.serviceId).toEqual({ not: null });
  });

  it("filters by status when query param provided", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.todo.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/marketing/coordinator-todos?status=completed"));
    const findArgs = prismaMock.todo.findMany.mock.calls[0][0];
    expect(findArgs.where.status).toBe("completed");
  });
});
