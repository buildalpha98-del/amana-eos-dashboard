import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession, type MockUserRole } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { GET as listProjects, POST as createProject } from "@/app/api/projects/route";
import { PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = { params: Promise.resolve({ id: "p-1" }) };

describe("GET /api/projects — groupBy progress (2026-08-31)", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    mockSession({ id: "u1", name: "Owner", role: "owner" });
  });

  it("401s unauthenticated", async () => {
    mockNoSession();
    const res = await listProjects(createRequest("GET", "/api/projects"));
    expect(res.status).toBe(401);
  });

  it("derives progress from ONE todo.groupBy, not per-project counts", async () => {
    prismaMock.project.findMany.mockResolvedValue([
      { id: "p-1", name: "A" },
      { id: "p-2", name: "B" },
    ]);
    prismaMock.todo.groupBy.mockResolvedValue([
      { projectId: "p-1", status: "complete", _count: 3 },
      { projectId: "p-1", status: "pending", _count: 1 },
      { projectId: "p-2", status: "pending", _count: 2 },
    ]);

    const res = await listProjects(createRequest("GET", "/api/projects"));
    const body = await res.json();

    expect(prismaMock.todo.count).not.toHaveBeenCalled();
    expect(prismaMock.todo.groupBy).toHaveBeenCalledTimes(1);
    const groupArg = prismaMock.todo.groupBy.mock.calls[0][0] as {
      by: string[];
      where: Record<string, unknown>;
    };
    expect(groupArg.by).toEqual(["projectId", "status"]);
    expect(groupArg.where.projectId).toEqual({ in: ["p-1", "p-2"] });

    const p1 = body.find((p: { id: string }) => p.id === "p-1");
    expect(p1.progress).toEqual({ total: 4, completed: 3, percent: 75 });
    const p2 = body.find((p: { id: string }) => p.id === "p-2");
    expect(p2.progress).toEqual({ total: 2, completed: 0, percent: 0 });
  });

  it("skips the groupBy entirely with zero projects", async () => {
    prismaMock.project.findMany.mockResolvedValue([]);
    const res = await listProjects(createRequest("GET", "/api/projects"));
    expect(res.status).toBe(200);
    expect(prismaMock.todo.groupBy).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects — rockId (2026-08-31)", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.project.create.mockResolvedValue({ id: "p-1", name: "P" });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it.each([["staff"], ["marketing"], ["eos_viewer"]])(
    "403s for role %s",
    async (role) => {
      prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
      mockSession({ id: "u1", name: "U", role: role as MockUserRole });
      const res = await createProject(
        createRequest("POST", "/api/projects", {
          body: { name: "P", ownerId: "u1" },
        }),
      );
      expect(res.status).toBe(403);
    },
  );

  it("400s when name or ownerId missing", async () => {
    const res = await createProject(
      createRequest("POST", "/api/projects", { body: { name: "P" } }),
    );
    expect(res.status).toBe(400);
  });

  it("validates rockId against a live rock", async () => {
    prismaMock.rock.findFirst.mockResolvedValue(null);
    const res = await createProject(
      createRequest("POST", "/api/projects", {
        body: { name: "P", ownerId: "u1", rockId: "nope" },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it("creates with a valid rockId stamped", async () => {
    prismaMock.rock.findFirst.mockResolvedValue({ id: "r-1" });
    const res = await createProject(
      createRequest("POST", "/api/projects", {
        body: { name: "P", ownerId: "u1", rockId: "r-1" },
      }),
    );
    expect(res.status).toBe(201);
    const arg = prismaMock.project.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data.rockId).toBe("r-1");
  });
});

describe("PATCH /api/projects/[id] — rockId", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p-1", deleted: false });
    prismaMock.project.update.mockResolvedValue({ id: "p-1" });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("links and unlinks a rock", async () => {
    prismaMock.rock.findFirst.mockResolvedValue({ id: "r-1" });
    const res = await patchProject(
      createRequest("PATCH", "/api/projects/p-1", { body: { rockId: "r-1" } }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(
      (prismaMock.project.update.mock.calls[0][0] as { data: Record<string, unknown> })
        .data.rockId,
    ).toBe("r-1");

    const res2 = await patchProject(
      createRequest("PATCH", "/api/projects/p-1", { body: { rockId: null } }),
      ctx,
    );
    expect(res2.status).toBe(200);
    expect(
      (prismaMock.project.update.mock.calls[1][0] as { data: Record<string, unknown> })
        .data.rockId,
    ).toBeNull();
  });
});
