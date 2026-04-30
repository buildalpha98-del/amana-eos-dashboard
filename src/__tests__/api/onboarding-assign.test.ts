import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { GET, POST } from "@/app/api/onboarding/assign/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/onboarding/assign", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/onboarding/assign");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("staff can only see their own assignments", async () => {
    mockSession({ id: "u-staff", name: "Staff", role: "staff", serviceId: "svc-1" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-staff", active: true, role: "staff" });
    prismaMock.staffOnboarding.findMany.mockResolvedValue([]);

    // Even when query asks for another user, staff scope wins
    const req = createRequest("GET", "/api/onboarding/assign?userId=other-user");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const whereArg = prismaMock.staffOnboarding.findMany.mock.calls[0][0].where;
    expect(whereArg.userId).toBe("u-staff");
  });

  it("admin can filter by userId", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });
    prismaMock.staffOnboarding.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/onboarding/assign?userId=target-user");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const whereArg = prismaMock.staffOnboarding.findMany.mock.calls[0][0].where;
    expect(whereArg.userId).toBe("target-user");
  });

  // ── Regression: 2026-04-29 confidentiality bug ─────────────────
  // Before the fix, every non-`staff` role saw every other staff member's
  // assignments because the route only scoped for role==="staff".
  it.each([
    ["member" as const, "u-member"],
    ["coordinator" as const, "u-coord"],
    ["marketing" as const, "u-marketing"],
  ])("%s can only see their own assignments (regression)", async (role, id) => {
    mockSession({ id, name: role, role, serviceId: "svc-1" });
    prismaMock.user.findUnique.mockResolvedValue({ id, active: true, role });
    prismaMock.staffOnboarding.findMany.mockResolvedValue([]);

    // Even when query asks for another user, role scope wins
    const req = createRequest("GET", "/api/onboarding/assign?userId=other-user");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const whereArg = prismaMock.staffOnboarding.findMany.mock.calls[0][0].where;
    expect(whereArg.userId).toBe(id);
  });

  it("head_office can filter by userId (admin-tier override)", async () => {
    mockSession({ id: "u-ho", name: "HO", role: "head_office" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-ho", active: true, role: "head_office" });
    prismaMock.staffOnboarding.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/onboarding/assign?userId=target-user");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const whereArg = prismaMock.staffOnboarding.findMany.mock.calls[0][0].where;
    expect(whereArg.userId).toBe("target-user");
  });

  it("owner without filter sees all assignments", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-owner", active: true, role: "owner" });
    prismaMock.staffOnboarding.findMany.mockResolvedValue([
      { id: "a1", userId: "u-other" },
    ]);

    const req = createRequest("GET", "/api/onboarding/assign");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const whereArg = prismaMock.staffOnboarding.findMany.mock.calls[0][0].where;
    expect(whereArg.userId).toBeUndefined();
  });

  // ── 2026-04-29: lazy task backfill regression ──────────────────
  // When admin adds new tasks to a pack AFTER assignments were created,
  // existing assignments' progress arrays are short by N entries — the
  // assignee sees "0/0 tasks" or a stale completion fraction. The GET
  // route detects the mismatch and creates the missing progress rows.
  it("backfills missing progress rows when pack tasks > progress rows", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });
    // Initial fetch: assignment has 0 progress rows but pack has 3 tasks
    prismaMock.staffOnboarding.findMany
      .mockResolvedValueOnce([
        {
          id: "a1",
          userId: "u-other",
          packId: "pack-1",
          pack: {
            id: "pack-1",
            name: "New Educator Induction",
            _count: { tasks: 3 },
          },
          progress: [],
        },
      ])
      // Re-fetch after backfill: progress now populated
      .mockResolvedValueOnce([
        {
          id: "a1",
          userId: "u-other",
          packId: "pack-1",
          pack: {
            id: "pack-1",
            name: "New Educator Induction",
            _count: { tasks: 3 },
          },
          progress: [
            { taskId: "t1", completed: false, task: { id: "t1" } },
            { taskId: "t2", completed: false, task: { id: "t2" } },
            { taskId: "t3", completed: false, task: { id: "t3" } },
          ],
        },
      ]);
    prismaMock.onboardingPack.findMany.mockResolvedValue([
      { id: "pack-1", tasks: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] },
    ] as never);
    prismaMock.staffOnboardingProgress.createMany.mockResolvedValue({
      count: 3,
    } as never);

    const req = createRequest("GET", "/api/onboarding/assign?userId=u-other");
    const res = await GET(req);
    expect(res.status).toBe(200);

    // The createMany call should have been made with all 3 missing taskIds.
    const createCall =
      prismaMock.staffOnboardingProgress.createMany.mock.calls[0]?.[0];
    expect(createCall?.data).toHaveLength(3);
    expect(createCall?.data?.[0]).toMatchObject({
      onboardingId: "a1",
      completed: false,
    });
    expect(createCall?.skipDuplicates).toBe(true);

    // Response reflects the re-fetched assignment with progress populated.
    const data = await res.json();
    expect(data[0].progress).toHaveLength(3);
  });

  it("does NOT backfill when pack tasks count matches progress rows", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });
    prismaMock.staffOnboarding.findMany.mockResolvedValue([
      {
        id: "a1",
        userId: "u-other",
        pack: { _count: { tasks: 2 } },
        progress: [
          { taskId: "t1", completed: true },
          { taskId: "t2", completed: false },
        ],
      },
    ] as never);

    const req = createRequest("GET", "/api/onboarding/assign?userId=u-other");
    await GET(req);

    expect(prismaMock.onboardingPack.findMany).not.toHaveBeenCalled();
    expect(prismaMock.staffOnboardingProgress.createMany).not.toHaveBeenCalled();
  });

  it("admin without filter sees all assignments", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });
    prismaMock.staffOnboarding.findMany.mockResolvedValue([
      { id: "a1", userId: "u-other" },
      { id: "a2", userId: "u-third" },
    ]);

    const req = createRequest("GET", "/api/onboarding/assign");
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveLength(2);

    const whereArg = prismaMock.staffOnboarding.findMany.mock.calls[0][0].where;
    expect(whereArg.userId).toBeUndefined();
  });
});

describe("POST /api/onboarding/assign — assignment creation", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { userId: "u-target", packId: "p1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("non-admin/owner roles → 403", async () => {
    mockSession({ id: "u-coord", name: "Coord", role: "coordinator" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-coord", active: true, role: "coordinator" });

    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { userId: "u-target", packId: "p1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("400 on invalid body (missing packId)", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });

    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { userId: "u-target" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("404 when pack not found", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });
    prismaMock.staffOnboarding.findUnique.mockResolvedValue(null);
    prismaMock.onboardingPack.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { userId: "u-target", packId: "missing" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("404 when pack is soft-deleted", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });
    prismaMock.staffOnboarding.findUnique.mockResolvedValue(null);
    prismaMock.onboardingPack.findUnique.mockResolvedValue({
      id: "p1",
      deleted: true,
      tasks: [],
    });

    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { userId: "u-target", packId: "p1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("409 when pack already assigned to user", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });
    prismaMock.staffOnboarding.findUnique.mockResolvedValue({
      id: "existing-1",
      userId: "u-target",
      packId: "p1",
    });

    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { userId: "u-target", packId: "p1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("201 on successful assignment (admin)", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });
    prismaMock.staffOnboarding.findUnique.mockResolvedValue(null);
    prismaMock.onboardingPack.findUnique.mockResolvedValue({
      id: "p1",
      deleted: false,
      tasks: [{ id: "t1" }, { id: "t2" }],
    });
    prismaMock.staffOnboarding.create.mockResolvedValue({
      id: "a1",
      userId: "u-target",
      packId: "p1",
      user: { id: "u-target", name: "Target", email: "t@test.com" },
      pack: { id: "p1", name: "Default" },
      progress: [],
    });
    prismaMock.activityLog.create.mockResolvedValue({ id: "log-1" });

    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { userId: "u-target", packId: "p1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const createArg = prismaMock.staffOnboarding.create.mock.calls[0][0];
    expect(createArg.data.userId).toBe("u-target");
    expect(createArg.data.packId).toBe("p1");
    // Pre-creates progress for each task
    expect(createArg.data.progress.create).toHaveLength(2);
  });
});

describe("POST /api/onboarding/assign — progress update branch", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
  });

  it("400 on invalid progress payload (missing taskId)", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-admin", active: true, role: "admin" });

    // body has onboardingId + taskId (key present) so router enters progress branch
    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { onboardingId: "a1", taskId: "" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("staff updating someone else's progress → 403", async () => {
    mockSession({ id: "u-staff", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-staff", active: true, role: "staff" });
    prismaMock.staffOnboarding.findUnique.mockResolvedValue({
      id: "a1",
      userId: "u-other",
    });

    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { onboardingId: "a1", taskId: "t1", completed: true },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("staff updating own progress → 200 + recalculates status", async () => {
    mockSession({ id: "u-staff", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-staff", active: true, role: "staff" });

    // First call: ownership check
    // Second call: include progress + pack.tasks (status recalc)
    prismaMock.staffOnboarding.findUnique
      .mockResolvedValueOnce({ id: "a1", userId: "u-staff" })
      .mockResolvedValueOnce({
        id: "a1",
        startedAt: null,
        progress: [{ taskId: "t1", completed: true }],
        pack: { tasks: [{ id: "t1", isRequired: true }] },
      });
    prismaMock.staffOnboardingProgress.upsert.mockResolvedValue({
      id: "prog-1",
      taskId: "t1",
      completed: true,
    });
    prismaMock.staffOnboarding.update.mockResolvedValue({ id: "a1", status: "completed" });

    const req = createRequest("POST", "/api/onboarding/assign", {
      body: { onboardingId: "a1", taskId: "t1", completed: true },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(prismaMock.staffOnboardingProgress.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.staffOnboarding.update).toHaveBeenCalledTimes(1);
    const upd = prismaMock.staffOnboarding.update.mock.calls[0][0];
    expect(upd.data.status).toBe("completed");
  });
});
