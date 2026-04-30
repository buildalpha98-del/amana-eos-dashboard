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
import { GET, POST } from "@/app/api/shift-swaps/route";
import { POST as acceptPost } from "@/app/api/shift-swaps/[id]/accept/route";
import { POST as rejectPost } from "@/app/api/shift-swaps/[id]/reject/route";
import { POST as approvePost } from "@/app/api/shift-swaps/[id]/approve/route";
import { POST as cancelPost } from "@/app/api/shift-swaps/[id]/cancel/route";

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
    userId: "u-proposer",
    staffName: "Alice",
    date: new Date("2026-04-20"),
    sessionType: "asc",
    shiftStart: "15:00",
    shiftEnd: "18:00",
    role: "educator",
    status: "published",
    ...overrides,
  };
}

function makeSwap(overrides: Record<string, unknown> = {}) {
  return {
    id: "sw-1",
    shiftId: "sh-1",
    proposerId: "u-proposer",
    targetId: "u-target",
    reason: null,
    status: "proposed",
    acceptedAt: null,
    approvedAt: null,
    approvedById: null,
    rejectedAt: null,
    rejectedReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    shift: {
      id: "sh-1",
      serviceId: "svc-1",
      userId: "u-proposer",
      date: new Date("2026-04-20"),
      shiftStart: "15:00",
      shiftEnd: "18:00",
    },
    ...overrides,
  };
}

// Canonical beforeEach — auth cache + mocks + default user lookup.
function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as {
      where?: { id?: string };
      select?: Record<string, boolean>;
    };
    if (select && "active" in select && !("serviceId" in select)) {
      // server-auth liveness check
      return Promise.resolve({ active: true });
    }
    // Default fallback for target-lookup style selects.
    return Promise.resolve({
      id: "u-target",
      name: "Bob",
      active: true,
      serviceId: "svc-1",
    });
  });
}

// ---------------------------------------------------------------------------
// POST /api/shift-swaps — propose
// ---------------------------------------------------------------------------

describe("POST /api/shift-swaps (propose)", () => {
  beforeEach(resetCommon);

  const validBody = { shiftId: "sh-1", targetId: "u-target", reason: "appt" };

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/shift-swaps", { body: validBody }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    const res = await POST(
      createRequest("POST", "/api/shift-swaps", { body: { shiftId: "sh-1" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when shift is not found", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/shift-swaps", { body: validBody }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when not the shift owner", async () => {
    mockSession({ id: "u-other", name: "Other", role: "staff" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(
      makeShift({ userId: "u-proposer" }),
    );
    const res = await POST(
      createRequest("POST", "/api/shift-swaps", { body: validBody }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when target user not found", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeShift());
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select, where } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select && !("serviceId" in select)) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "u-target") return Promise.resolve(null);
      return Promise.resolve(null);
    });
    const res = await POST(
      createRequest("POST", "/api/shift-swaps", { body: validBody }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when target user is inactive", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeShift());
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select, where } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select && !("serviceId" in select)) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "u-target") {
        return Promise.resolve({
          id: "u-target",
          name: "Bob",
          active: false,
          serviceId: "svc-1",
        });
      }
      return Promise.resolve(null);
    });
    const res = await POST(
      createRequest("POST", "/api/shift-swaps", { body: validBody }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when target is at a different service", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeShift());
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select, where } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select && !("serviceId" in select)) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "u-target") {
        return Promise.resolve({
          id: "u-target",
          name: "Bob",
          active: true,
          serviceId: "svc-OTHER",
        });
      }
      return Promise.resolve(null);
    });
    const res = await POST(
      createRequest("POST", "/api/shift-swaps", { body: validBody }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when proposing to yourself", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeShift());
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select, where } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select && !("serviceId" in select)) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "u-proposer") {
        return Promise.resolve({
          id: "u-proposer",
          name: "Alice",
          active: true,
          serviceId: "svc-1",
        });
      }
      return Promise.resolve(null);
    });
    const res = await POST(
      createRequest("POST", "/api/shift-swaps", {
        body: { shiftId: "sh-1", targetId: "u-proposer" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates swap + notification on happy path", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeShift());
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select, where } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select && !("serviceId" in select)) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "u-target") {
        return Promise.resolve({
          id: "u-target",
          name: "Bob",
          active: true,
          serviceId: "svc-1",
        });
      }
      return Promise.resolve(null);
    });
    prismaMock.shiftSwapRequest.create.mockResolvedValue(makeSwap());
    prismaMock.userNotification.create.mockResolvedValue({ id: "n-1" });

    const res = await POST(
      createRequest("POST", "/api/shift-swaps", { body: validBody }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.swap.id).toBe("sw-1");

    expect(prismaMock.shiftSwapRequest.create).toHaveBeenCalled();
    const createCall = prismaMock.shiftSwapRequest.create.mock.calls[0][0];
    expect(createCall.data.proposerId).toBe("u-proposer");
    expect(createCall.data.targetId).toBe("u-target");
    expect(createCall.data.status).toBe("proposed");

    expect(prismaMock.userNotification.create).toHaveBeenCalled();
    const notifCall = prismaMock.userNotification.create.mock.calls[0][0];
    expect(notifCall.data.userId).toBe("u-target");
    expect(notifCall.data.type).toBe("shift_swap_proposed");
    expect(notifCall.data.link).toMatch(/\/roster\/me\?swap=sw-1/);
  });
});

// ---------------------------------------------------------------------------
// POST /api/shift-swaps/[id]/accept
// ---------------------------------------------------------------------------

describe("POST /api/shift-swaps/[id]/accept", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await acceptPost(
      createRequest("POST", "/api/shift-swaps/sw-1/accept"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when swap is not found", async () => {
    mockSession({ id: "u-target", name: "Bob", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(null);
    const res = await acceptPost(
      createRequest("POST", "/api/shift-swaps/sw-1/accept"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is not the target", async () => {
    mockSession({ id: "u-other", name: "Other", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(makeSwap());
    const res = await acceptPost(
      createRequest("POST", "/api/shift-swaps/sw-1/accept"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 409 when swap status is not 'proposed'", async () => {
    mockSession({ id: "u-target", name: "Bob", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      makeSwap({ status: "accepted" }),
    );
    const res = await acceptPost(
      createRequest("POST", "/api/shift-swaps/sw-1/accept"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(409);
  });

  it("accepts + notifies proposer and admins/coords on happy path", async () => {
    mockSession({ id: "u-target", name: "Bob", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(makeSwap());
    prismaMock.shiftSwapRequest.update.mockResolvedValue(
      makeSwap({ status: "accepted", acceptedAt: new Date() }),
    );
    prismaMock.userNotification.create.mockResolvedValue({ id: "n-1" });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "admin-1" },
      { id: "coord-1" },
    ]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });

    const res = await acceptPost(
      createRequest("POST", "/api/shift-swaps/sw-1/accept"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(200);

    // Proposer got a direct notification
    expect(prismaMock.userNotification.create).toHaveBeenCalled();
    const dmCall = prismaMock.userNotification.create.mock.calls[0][0];
    expect(dmCall.data.userId).toBe("u-proposer");
    expect(dmCall.data.type).toBe("shift_swap_accepted");

    // Admins/coords got a batched notification
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
    const manyCall = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(manyCall.data).toHaveLength(2);
    expect(manyCall.data[0].type).toBe("shift_swap_accepted");
    expect(manyCall.data[0].link).toMatch(/\/roster\/swaps\?id=sw-1/);
  });

  it("skips admin notifications when there are no admins", async () => {
    mockSession({ id: "u-target", name: "Bob", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(makeSwap());
    prismaMock.shiftSwapRequest.update.mockResolvedValue(
      makeSwap({ status: "accepted" }),
    );
    prismaMock.userNotification.create.mockResolvedValue({ id: "n-1" });
    prismaMock.user.findMany.mockResolvedValue([]);

    const res = await acceptPost(
      createRequest("POST", "/api/shift-swaps/sw-1/accept"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/shift-swaps/[id]/reject
// ---------------------------------------------------------------------------

describe("POST /api/shift-swaps/[id]/reject", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await rejectPost(
      createRequest("POST", "/api/shift-swaps/sw-1/reject", { body: {} }),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not the target", async () => {
    mockSession({ id: "u-other", name: "Other", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue({
      id: "sw-1",
      status: "proposed",
      targetId: "u-target",
      proposerId: "u-proposer",
    });
    const res = await rejectPost(
      createRequest("POST", "/api/shift-swaps/sw-1/reject", { body: {} }),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 409 when swap is not 'proposed'", async () => {
    mockSession({ id: "u-target", name: "Bob", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue({
      id: "sw-1",
      status: "approved",
      targetId: "u-target",
      proposerId: "u-proposer",
    });
    const res = await rejectPost(
      createRequest("POST", "/api/shift-swaps/sw-1/reject", { body: {} }),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(409);
  });

  it("rejects + notifies proposer with reason on happy path", async () => {
    mockSession({ id: "u-target", name: "Bob", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue({
      id: "sw-1",
      status: "proposed",
      targetId: "u-target",
      proposerId: "u-proposer",
    });
    prismaMock.shiftSwapRequest.update.mockResolvedValue({
      id: "sw-1",
      status: "rejected",
    });
    prismaMock.userNotification.create.mockResolvedValue({ id: "n-1" });

    const res = await rejectPost(
      createRequest("POST", "/api/shift-swaps/sw-1/reject", {
        body: { reason: "busy that day" },
      }),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(200);

    const updateCall = prismaMock.shiftSwapRequest.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("rejected");
    expect(updateCall.data.rejectedReason).toBe("busy that day");

    const notifCall = prismaMock.userNotification.create.mock.calls[0][0];
    expect(notifCall.data.userId).toBe("u-proposer");
    expect(notifCall.data.type).toBe("shift_swap_rejected");
    expect(notifCall.data.body).toMatch(/busy that day/);
  });

  it("omits reason gracefully when not provided", async () => {
    mockSession({ id: "u-target", name: "Bob", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue({
      id: "sw-1",
      status: "proposed",
      targetId: "u-target",
      proposerId: "u-proposer",
    });
    prismaMock.shiftSwapRequest.update.mockResolvedValue({
      id: "sw-1",
      status: "rejected",
    });
    prismaMock.userNotification.create.mockResolvedValue({ id: "n-1" });

    const res = await rejectPost(
      createRequest("POST", "/api/shift-swaps/sw-1/reject", { body: {} }),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.shiftSwapRequest.update.mock.calls[0][0];
    expect(updateCall.data.rejectedReason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /api/shift-swaps/[id]/approve
// ---------------------------------------------------------------------------

describe("POST /api/shift-swaps/[id]/approve", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await approvePost(
      createRequest("POST", "/api/shift-swaps/sw-1/approve"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when swap not found", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(null);
    const res = await approvePost(
      createRequest("POST", "/api/shift-swaps/sw-1/approve"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when swap is not 'accepted'", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      makeSwap({ status: "proposed" }),
    );
    const res = await approvePost(
      createRequest("POST", "/api/shift-swaps/sw-1/approve"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(409);
  });

  it("returns 403 when caller is staff", async () => {
    mockSession({ id: "u-target", name: "Bob", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      makeSwap({ status: "accepted" }),
    );
    const res = await approvePost(
      createRequest("POST", "/api/shift-swaps/sw-1/approve"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when coordinator is at a different service", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-OTHER",
    });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      makeSwap({ status: "accepted" }),
    );
    const res = await approvePost(
      createRequest("POST", "/api/shift-swaps/sw-1/approve"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(403);
  });

  it("approves + atomic 3-write on happy path (admin)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      makeSwap({ status: "accepted" }),
    );
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select, where } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select && !("serviceId" in select)) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "u-target") return Promise.resolve({ name: "Bob" });
      return Promise.resolve(null);
    });
    prismaMock.shiftSwapRequest.update.mockResolvedValue(
      makeSwap({ status: "approved" }),
    );
    prismaMock.rosterShift.update.mockResolvedValue(makeShift({ userId: "u-target" }));
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });

    const res = await approvePost(
      createRequest("POST", "/api/shift-swaps/sw-1/approve"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(200);

    // Swap updated → approved
    const swapUpdate = prismaMock.shiftSwapRequest.update.mock.calls[0][0];
    expect(swapUpdate.data.status).toBe("approved");
    expect(swapUpdate.data.approvedById).toBe("admin-1");

    // RosterShift moved to target
    expect(prismaMock.rosterShift.update).toHaveBeenCalled();
    const shiftUpdate = prismaMock.rosterShift.update.mock.calls[0][0];
    expect(shiftUpdate.data.userId).toBe("u-target");
    expect(shiftUpdate.data.staffName).toBe("Bob");

    // Two notifications fanned out
    const manyCall = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(manyCall.data).toHaveLength(2);
    expect(manyCall.data.map((n: { userId: string }) => n.userId).sort()).toEqual([
      "u-proposer",
      "u-target",
    ]);
  });

  it("allows coordinator at the matching service", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      makeSwap({ status: "accepted" }),
    );
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select, where } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select && !("serviceId" in select)) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "u-target") return Promise.resolve({ name: "Bob" });
      return Promise.resolve(null);
    });
    prismaMock.shiftSwapRequest.update.mockResolvedValue(
      makeSwap({ status: "approved" }),
    );
    prismaMock.rosterShift.update.mockResolvedValue(makeShift());
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });

    const res = await approvePost(
      createRequest("POST", "/api/shift-swaps/sw-1/approve"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/shift-swaps/[id]/cancel
// ---------------------------------------------------------------------------

describe("POST /api/shift-swaps/[id]/cancel", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await cancelPost(
      createRequest("POST", "/api/shift-swaps/sw-1/cancel"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when swap not found", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(null);
    const res = await cancelPost(
      createRequest("POST", "/api/shift-swaps/sw-1/cancel"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is not the proposer", async () => {
    mockSession({ id: "u-target", name: "Bob", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue({
      id: "sw-1",
      status: "proposed",
      proposerId: "u-proposer",
    });
    const res = await cancelPost(
      createRequest("POST", "/api/shift-swaps/sw-1/cancel"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 409 when swap status is not 'proposed'", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue({
      id: "sw-1",
      status: "accepted",
      proposerId: "u-proposer",
    });
    const res = await cancelPost(
      createRequest("POST", "/api/shift-swaps/sw-1/cancel"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(409);
  });

  it("cancels on happy path", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue({
      id: "sw-1",
      status: "proposed",
      proposerId: "u-proposer",
    });
    prismaMock.shiftSwapRequest.update.mockResolvedValue({
      id: "sw-1",
      status: "cancelled",
    });
    const res = await cancelPost(
      createRequest("POST", "/api/shift-swaps/sw-1/cancel"),
      paramsOf("sw-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.swap.status).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// GET /api/shift-swaps — list
// ---------------------------------------------------------------------------

describe("GET /api/shift-swaps (list)", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/shift-swaps"));
    expect(res.status).toBe(401);
  });

  it("scope=mine returns swaps where user is proposer or target", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.shiftSwapRequest.findMany.mockResolvedValue([makeSwap()]);

    const res = await GET(
      createRequest("GET", "/api/shift-swaps?scope=mine"),
    );
    expect(res.status).toBe(200);

    const call = prismaMock.shiftSwapRequest.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toContainEqual({ proposerId: "u-proposer" });
    expect(call.where.OR).toContainEqual({ targetId: "u-proposer" });
  });

  it("scope=service scopes coordinator to own service", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.shiftSwapRequest.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", "/api/shift-swaps?scope=service"),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.shiftSwapRequest.findMany.mock.calls[0][0];
    expect(call.where.shift).toEqual({ serviceId: "svc-1" });
  });

  it("scope=service for admin has no service filter", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.shiftSwapRequest.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", "/api/shift-swaps?scope=service"),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.shiftSwapRequest.findMany.mock.calls[0][0];
    expect(call.where.shift).toBeUndefined();
  });

  it("scope=all returns 403 for non-admin", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    const res = await GET(
      createRequest("GET", "/api/shift-swaps?scope=all"),
    );
    expect(res.status).toBe(403);
  });

  it("scope=all works for admin", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.shiftSwapRequest.findMany.mockResolvedValue([]);
    const res = await GET(
      createRequest("GET", "/api/shift-swaps?scope=all"),
    );
    expect(res.status).toBe(200);
  });

  it("status filter is applied to where clause", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    prismaMock.shiftSwapRequest.findMany.mockResolvedValue([]);
    const res = await GET(
      createRequest(
        "GET",
        "/api/shift-swaps?scope=mine&status=approved",
      ),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.shiftSwapRequest.findMany.mock.calls[0][0];
    expect(call.where.status).toBe("approved");
  });

  it("returns 400 on invalid status enum", async () => {
    mockSession({ id: "u-proposer", name: "Alice", role: "staff" });
    const res = await GET(
      createRequest("GET", "/api/shift-swaps?status=bogus"),
    );
    expect(res.status).toBe(400);
  });
});
