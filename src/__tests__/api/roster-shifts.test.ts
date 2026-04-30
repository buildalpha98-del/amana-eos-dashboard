import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Mock rate-limit so 429s do not interfere.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));

// Mock logger.
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

// Import after mocks.
import { GET, POST } from "@/app/api/roster/shifts/route";
import {
  PATCH,
  DELETE,
} from "@/app/api/roster/shifts/[id]/route";
import { POST as publishPost } from "@/app/api/roster/publish/route";
import { POST as copyWeekPost } from "@/app/api/roster/copy-week/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeShift(overrides: Record<string, unknown> = {}) {
  return {
    id: "sh-1",
    serviceId: "svc-1",
    userId: "u-1",
    staffName: "Alice",
    date: new Date("2026-04-20"),
    sessionType: "asc",
    shiftStart: "15:00",
    shiftEnd: "18:00",
    role: "educator",
    status: "draft",
    publishedAt: null,
    createdById: "admin-1",
    syncedAt: new Date(),
    ...overrides,
  };
}

// A canonical beforeEach used by every describe: clear caches + mocks, and
// default user.findUnique to an active user so server-auth passes.
function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { where?: { id?: string }; select?: Record<string, boolean> };
    // server-auth's isUserActive check selects `active`.
    if (select && "active" in select) {
      return Promise.resolve({ active: true });
    }
    // Route handlers that select `name` for staffName hydration.
    if (select && "name" in select) {
      return Promise.resolve({ name: "Lookup User" });
    }
    // Fallback for any other shape.
    return Promise.resolve({ active: true, name: "Lookup User" });
  });
}

// ---------------------------------------------------------------------------
// GET /api/roster/shifts
// ---------------------------------------------------------------------------

describe("GET /api/roster/shifts", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/roster/shifts?serviceId=svc-1&weekStart=2026-04-20"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when missing serviceId", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/roster/shifts?weekStart=2026-04-20"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when weekStart is malformed", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/roster/shifts?serviceId=svc-1&weekStart=20-04-2026"),
    );
    expect(res.status).toBe(400);
  });

  it("returns shifts for the week (admin happy path)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([makeShift()]);

    const res = await GET(
      createRequest("GET", "/api/roster/shifts?serviceId=svc-1&weekStart=2026-04-20"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shifts).toHaveLength(1);
    expect(body.shifts[0].id).toBe("sh-1");

    // Window is 7 days, correctly scoped by serviceId.
    const call = prismaMock.rosterShift.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-1");
    expect(call.where.date.gte).toBeInstanceOf(Date);
    expect(call.where.date.lt).toBeInstanceOf(Date);
    const spanMs =
      (call.where.date.lt as Date).getTime() -
      (call.where.date.gte as Date).getTime();
    expect(spanMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("coordinator can GET within scope (server does not 403 on GET)", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.rosterShift.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", "/api/roster/shifts?serviceId=svc-1&weekStart=2026-04-20"),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/roster/shifts
// ---------------------------------------------------------------------------

describe("POST /api/roster/shifts", () => {
  beforeEach(resetCommon);

  const validBody = {
    serviceId: "svc-1",
    userId: "u-1",
    date: "2026-04-20",
    sessionType: "asc",
    shiftStart: "15:00",
    shiftEnd: "18:00",
    role: "educator",
  };

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/roster/shifts", { body: validBody }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", "/api/roster/shifts", {
        body: { serviceId: "svc-1" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when shiftEnd <= shiftStart", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", "/api/roster/shifts", {
        body: { ...validBody, shiftStart: "18:00", shiftEnd: "15:00" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/shiftEnd must be later/);
  });

  it("returns 403 when coordinator tries cross-service create", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-other",
    });
    const res = await POST(
      createRequest("POST", "/api/roster/shifts", { body: validBody }),
    );
    expect(res.status).toBe(403);
  });

  it("creates a shift on happy path and hydrates staffName from user.name", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { where, select } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select) return Promise.resolve({ active: true });
      if (where?.id === "u-1") return Promise.resolve({ name: "Alice" });
      return Promise.resolve(null);
    });
    prismaMock.rosterShift.create.mockResolvedValue(
      makeShift({ staffName: "Alice" }),
    );

    const res = await POST(
      createRequest("POST", "/api/roster/shifts", { body: validBody }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.shift.staffName).toBe("Alice");

    const call = prismaMock.rosterShift.create.mock.calls[0][0];
    expect(call.data.staffName).toBe("Alice");
    expect(call.data.createdById).toBe("admin-1");
    expect(call.data.status).toBe("draft");
  });

  it("returns 404 when target user does not exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select } = args as { select?: Record<string, boolean> };
      if (select && "active" in select) return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await POST(
      createRequest("POST", "/api/roster/shifts", { body: validBody }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/roster/shifts/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/roster/shifts/[id]", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await PATCH(
      createRequest("PATCH", "/api/roster/shifts/sh-1", {
        body: { role: "lead" },
      }),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for coordinator on cross-service shift", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-other",
    });
    prismaMock.rosterShift.findUnique.mockResolvedValue(
      makeShift({ serviceId: "svc-1" }),
    );

    const res = await PATCH(
      createRequest("PATCH", "/api/roster/shifts/sh-1", {
        body: { role: "lead" },
      }),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(403);
  });

  it("updates a shift on happy path (admin)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeShift());
    prismaMock.rosterShift.update.mockResolvedValue(
      makeShift({ role: "lead" }),
    );

    const res = await PATCH(
      createRequest("PATCH", "/api/roster/shifts/sh-1", {
        body: { role: "lead" },
      }),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shift.role).toBe("lead");
  });

  it("re-hydrates staffName when userId changes", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(
      makeShift({ userId: "u-1", staffName: "Alice" }),
    );
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { where, select } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select) return Promise.resolve({ active: true });
      if (where?.id === "u-2") return Promise.resolve({ name: "Bob" });
      return Promise.resolve(null);
    });
    prismaMock.rosterShift.update.mockResolvedValue(
      makeShift({ userId: "u-2", staffName: "Bob" }),
    );

    const res = await PATCH(
      createRequest("PATCH", "/api/roster/shifts/sh-1", {
        body: { userId: "u-2" },
      }),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.rosterShift.update.mock.calls[0][0];
    expect(call.data.userId).toBe("u-2");
    expect(call.data.staffName).toBe("Bob");
  });

  it("returns 400 when the proposed time window is invalid", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeShift());

    const res = await PATCH(
      createRequest("PATCH", "/api/roster/shifts/sh-1", {
        body: { shiftStart: "20:00" },
      }),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/roster/shifts/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/roster/shifts/[id]", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await DELETE(
      createRequest("DELETE", "/api/roster/shifts/sh-1"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for coordinator on cross-service shift", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-other",
    });
    prismaMock.rosterShift.findUnique.mockResolvedValue(
      makeShift({ serviceId: "svc-1" }),
    );

    const res = await DELETE(
      createRequest("DELETE", "/api/roster/shifts/sh-1"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 409 when a swap is pending", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeShift());
    prismaMock.shiftSwapRequest.findFirst.mockResolvedValue({
      id: "swap-1",
      shiftId: "sh-1",
      status: "proposed",
    });

    const res = await DELETE(
      createRequest("DELETE", "/api/roster/shifts/sh-1"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(409);
  });

  it("deletes on happy path", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeShift());
    prismaMock.shiftSwapRequest.findFirst.mockResolvedValue(null);
    prismaMock.rosterShift.delete.mockResolvedValue(makeShift());

    const res = await DELETE(
      createRequest("DELETE", "/api/roster/shifts/sh-1"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.rosterShift.delete).toHaveBeenCalledWith({
      where: { id: "sh-1" },
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/roster/publish
// ---------------------------------------------------------------------------

describe("POST /api/roster/publish", () => {
  beforeEach(resetCommon);

  const validBody = { serviceId: "svc-1", weekStart: "2026-04-20" };

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await publishPost(
      createRequest("POST", "/api/roster/publish", { body: validBody }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for coordinator on cross-service publish", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-other",
    });
    const res = await publishPost(
      createRequest("POST", "/api/roster/publish", { body: validBody }),
    );
    expect(res.status).toBe(403);
  });

  it("updates drafts to published and emits one notification per distinct staff", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    // Three drafts: two for user u-1 (same staffer twice) and one for u-2.
    prismaMock.rosterShift.findMany.mockResolvedValue([
      { userId: "u-1" },
      { userId: "u-1" },
      { userId: "u-2" },
      { userId: null }, // orphan — should not count toward notifications
    ]);
    prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 4 });
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });

    const res = await publishPost(
      createRequest("POST", "/api/roster/publish", { body: validBody }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publishedCount).toBe(4);
    expect(body.notificationsSent).toBe(2);

    const createManyCall =
      prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(createManyCall.data).toHaveLength(2);
    expect(createManyCall.data[0].type).toBe("roster_published");
    expect(createManyCall.data[0].link).toBe(
      "/roster/me?weekStart=2026-04-20",
    );
  });

  it("sends no notifications when there are no draft shifts", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([]);
    prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 0 });

    const res = await publishPost(
      createRequest("POST", "/api/roster/publish", { body: validBody }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publishedCount).toBe(0);
    expect(body.notificationsSent).toBe(0);
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/roster/copy-week
// ---------------------------------------------------------------------------

describe("POST /api/roster/copy-week", () => {
  beforeEach(resetCommon);

  const validBody = {
    serviceId: "svc-1",
    sourceWeekStart: "2026-04-13",
    targetWeekStart: "2026-04-20",
  };

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await copyWeekPost(
      createRequest("POST", "/api/roster/copy-week", { body: validBody }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for coordinator on cross-service copy", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-other",
    });
    const res = await copyWeekPost(
      createRequest("POST", "/api/roster/copy-week", { body: validBody }),
    );
    expect(res.status).toBe(403);
  });

  it("creates when no target collision", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([
      makeShift({ date: new Date("2026-04-13") }),
    ]);
    prismaMock.rosterShift.findUnique.mockResolvedValue(null);
    prismaMock.rosterShift.create.mockResolvedValue(makeShift());

    const res = await copyWeekPost(
      createRequest("POST", "/api/roster/copy-week", { body: validBody }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.replaced).toBe(0);
    expect(body.skipped).toEqual([]);
  });

  it("replaces when target has a draft", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([
      makeShift({ date: new Date("2026-04-13") }),
    ]);
    prismaMock.rosterShift.findUnique.mockResolvedValue(
      makeShift({ id: "sh-target-draft", status: "draft" }),
    );
    prismaMock.rosterShift.delete.mockResolvedValue(makeShift());
    prismaMock.rosterShift.create.mockResolvedValue(makeShift());

    const res = await copyWeekPost(
      createRequest("POST", "/api/roster/copy-week", { body: validBody }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.replaced).toBe(1);
    expect(body.skipped).toEqual([]);
    expect(prismaMock.rosterShift.delete).toHaveBeenCalledWith({
      where: { id: "sh-target-draft" },
    });
  });

  it("skips when target has a published shift", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findMany.mockResolvedValue([
      makeShift({ date: new Date("2026-04-13"), staffName: "Alice" }),
    ]);
    prismaMock.rosterShift.findUnique.mockResolvedValue(
      makeShift({ id: "sh-target-pub", status: "published" }),
    );

    const res = await copyWeekPost(
      createRequest("POST", "/api/roster/copy-week", { body: validBody }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.replaced).toBe(0);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].staffName).toBe("Alice");
    expect(body.skipped[0].reason).toMatch(/published/);
    expect(prismaMock.rosterShift.create).not.toHaveBeenCalled();
    expect(prismaMock.rosterShift.delete).not.toHaveBeenCalled();
  });
});
