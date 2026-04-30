import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession, type MockUserRole } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/onboarding/packs/route";
import { GET as GET_ONE, PATCH, DELETE } from "@/app/api/onboarding/packs/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

describe("GET /api/onboarding/packs", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/onboarding/packs");
    const res = await GET_LIST(req);
    expect(res.status).toBe(401);
  });

  it("returns the list of non-deleted packs", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.onboardingPack.findMany.mockResolvedValue([
      { id: "p1", name: "Default", isDefault: true, _count: { tasks: 5, assignments: 2 } },
    ]);

    const req = createRequest("GET", "/api/onboarding/packs");
    const res = await GET_LIST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("p1");

    const whereArg = prismaMock.onboardingPack.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ deleted: false });
  });

  it("staff scope: filters to own service + null serviceId + isDefault", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: "svc-1" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "staff" });
    prismaMock.onboardingPack.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/onboarding/packs");
    const res = await GET_LIST(req);
    expect(res.status).toBe(200);

    const whereArg = prismaMock.onboardingPack.findMany.mock.calls[0][0].where;
    expect(whereArg.OR).toEqual([
      { serviceId: "svc-1" },
      { serviceId: null },
      { isDefault: true },
    ]);
  });
});

describe("POST /api/onboarding/packs", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/onboarding/packs", {
      body: { name: "New Pack" },
    });
    const res = await POST_CREATE(req);
    expect(res.status).toBe(401);
  });

  it.each([
    ["owner", 201],
    ["head_office", 201],
    ["admin", 201],
    ["member", 403],
    ["staff", 403],
  ])("role %s → %i", async (role, expected) => {
    mockSession({ id: "u1", name: "U", role: role as MockUserRole });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
    prismaMock.onboardingPack.create.mockResolvedValue({
      id: "p1",
      name: "New Pack",
      tasks: [],
      _count: { tasks: 0, assignments: 0 },
    });
    prismaMock.activityLog.create.mockResolvedValue({ id: "log-1" });

    const req = createRequest("POST", "/api/onboarding/packs", {
      body: { name: "New Pack" },
    });
    const res = await POST_CREATE(req);
    expect(res.status).toBe(expected);
  });

  it("400 when name is missing", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });

    const req = createRequest("POST", "/api/onboarding/packs", {
      body: { description: "no name" },
    });
    const res = await POST_CREATE(req);
    expect(res.status).toBe(400);
  });

  it("400 when name is empty string", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });

    const req = createRequest("POST", "/api/onboarding/packs", {
      body: { name: "" },
    });
    const res = await POST_CREATE(req);
    expect(res.status).toBe(400);
  });

  it("creates a pack with tasks (happy path)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.onboardingPack.create.mockResolvedValue({
      id: "p1",
      name: "New Pack",
      tasks: [{ id: "t1", title: "Task 1" }],
      _count: { tasks: 1, assignments: 0 },
    });
    prismaMock.activityLog.create.mockResolvedValue({ id: "log-1" });

    const req = createRequest("POST", "/api/onboarding/packs", {
      body: {
        name: "New Pack",
        description: "Onboarding for new staff",
        tasks: [{ title: "Task 1", category: "general" }],
      },
    });
    const res = await POST_CREATE(req);
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.id).toBe("p1");

    const createArg = prismaMock.onboardingPack.create.mock.calls[0][0];
    expect(createArg.data.name).toBe("New Pack");
    expect(createArg.data.tasks.create).toHaveLength(1);
  });
});

describe("GET /api/onboarding/packs/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/onboarding/packs/p1");
    const res = await GET_ONE(req, ctx({ id: "p1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when pack not found", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.onboardingPack.findUnique.mockResolvedValue(null);

    const req = createRequest("GET", "/api/onboarding/packs/missing");
    const res = await GET_ONE(req, ctx({ id: "missing" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when pack is soft-deleted", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.onboardingPack.findUnique.mockResolvedValue({
      id: "p1",
      name: "Old",
      deleted: true,
      tasks: [],
      assignments: [],
    });

    const req = createRequest("GET", "/api/onboarding/packs/p1");
    const res = await GET_ONE(req, ctx({ id: "p1" }));
    expect(res.status).toBe(404);
  });

  it("returns the pack details (200)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.onboardingPack.findUnique.mockResolvedValue({
      id: "p1",
      name: "Default",
      deleted: false,
      tasks: [],
      assignments: [],
    });

    const req = createRequest("GET", "/api/onboarding/packs/p1");
    const res = await GET_ONE(req, ctx({ id: "p1" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.id).toBe("p1");
  });
});

describe("PATCH /api/onboarding/packs/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/onboarding/packs/p1", {
      body: { name: "Renamed" },
    });
    const res = await PATCH(req, ctx({ id: "p1" }));
    expect(res.status).toBe(401);
  });

  it("staff (forbidden role) → 403", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "staff" });

    const req = createRequest("PATCH", "/api/onboarding/packs/p1", {
      body: { name: "Renamed" },
    });
    const res = await PATCH(req, ctx({ id: "p1" }));
    expect(res.status).toBe(403);
  });

  it("admin renames a pack (200)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    prismaMock.onboardingPack.update.mockResolvedValue({
      id: "p1",
      name: "Renamed",
      _count: { tasks: 0, assignments: 0 },
    });

    const req = createRequest("PATCH", "/api/onboarding/packs/p1", {
      body: { name: "Renamed" },
    });
    const res = await PATCH(req, ctx({ id: "p1" }));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/onboarding/packs/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("DELETE", "/api/onboarding/packs/p1");
    const res = await DELETE(req, ctx({ id: "p1" }));
    expect(res.status).toBe(401);
  });

  it("staff (forbidden role) → 403", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "staff" });

    const req = createRequest("DELETE", "/api/onboarding/packs/p1");
    const res = await DELETE(req, ctx({ id: "p1" }));
    expect(res.status).toBe(403);
  });

  it("owner soft-deletes the pack (200)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.onboardingPack.update.mockResolvedValue({ id: "p1", deleted: true });

    const req = createRequest("DELETE", "/api/onboarding/packs/p1");
    const res = await DELETE(req, ctx({ id: "p1" }));
    expect(res.status).toBe(200);

    const updateArg = prismaMock.onboardingPack.update.mock.calls[0][0];
    expect(updateArg.data).toMatchObject({ deleted: true });
  });
});
