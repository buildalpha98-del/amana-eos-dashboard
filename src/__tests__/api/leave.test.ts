import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
  ),
}));

// Mock logger
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

// Import after mocks
import { GET, POST } from "@/app/api/leave/requests/route";
import {
  GET as getLeaveRequest,
  PATCH,
  DELETE,
} from "@/app/api/leave/requests/[id]/route";

describe("GET /api/leave/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/leave/requests");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns leave requests for authenticated user", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const mockRequests = [
      {
        id: "lr-1",
        userId: "user-1",
        leaveType: "annual",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-04-05"),
        totalDays: 5,
        status: "leave_pending",
        user: { id: "user-1", name: "Test", email: "test@test.com", avatar: null },
        reviewedBy: null,
        service: null,
      },
    ];
    prismaMock.leaveRequest.findMany.mockResolvedValue(mockRequests);

    const req = createRequest("GET", "/api/leave/requests");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].leaveType).toBe("annual");
  });
});

describe("POST /api/leave/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 400 with missing required fields", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const req = createRequest("POST", "/api/leave/requests", {
      body: { leaveType: "annual" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("creates leave request with valid data", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner", serviceId: "svc-1" });

    const created = {
      id: "lr-new",
      userId: "user-1",
      leaveType: "annual",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-03"),
      totalDays: 3,
      isHalfDay: false,
      reason: "Holiday",
      status: "leave_pending",
      serviceId: "svc-1",
      user: { id: "user-1", name: "Test", email: "test@test.com", avatar: null },
      service: { id: "svc-1", name: "Svc", code: "SVC1" },
    };
    prismaMock.leaveRequest.create.mockResolvedValue(created);
    prismaMock.activityLog.create.mockResolvedValue({});
    // No coordinators by default for this test — notification path short-circuits.
    prismaMock.user.findMany.mockResolvedValue([]);

    const req = createRequest("POST", "/api/leave/requests", {
      body: {
        leaveType: "annual",
        startDate: "2026-04-01",
        endDate: "2026-04-03",
        reason: "Holiday",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("lr-new");
    expect(prismaMock.leaveRequest.create).toHaveBeenCalled();
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });

  it("creates a LEAVE_SUBMITTED notification for each coordinator at the submitter's service", async () => {
    mockSession({
      id: "user-1",
      name: "Mirna",
      role: "staff",
      serviceId: "svc-1",
    });

    const created = {
      id: "lr-new",
      userId: "user-1",
      leaveType: "annual",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-03"),
      totalDays: 3,
      isHalfDay: false,
      reason: null,
      status: "leave_pending",
      serviceId: "svc-1",
      user: { id: "user-1", name: "Mirna", email: "mirna@test.com", avatar: null },
      service: { id: "svc-1", name: "Svc", code: "SVC1" },
    };
    prismaMock.leaveRequest.create.mockResolvedValue(created);
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([{ id: "coord-1" }, { id: "coord-2" }]);
    prismaMock.userNotification.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/leave/requests", {
      body: {
        leaveType: "annual",
        startDate: "2026-04-01",
        endDate: "2026-04-03",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    // Coordinator lookup scoped to requester's service + active
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "coordinator",
          serviceId: "svc-1",
          active: true,
        }),
      }),
    );

    expect(prismaMock.userNotification.create).toHaveBeenCalledTimes(2);
    const firstArg = prismaMock.userNotification.create.mock.calls[0][0];
    expect(firstArg.data.userId).toBe("coord-1");
    expect(firstArg.data.type).toBe("leave_submitted");
    expect(firstArg.data.title).toContain("Mirna");
    expect(firstArg.data.link).toBe("/leave?id=lr-new");
  });

  it("still returns 201 when notification creation fails", async () => {
    mockSession({
      id: "user-1",
      name: "Mirna",
      role: "staff",
      serviceId: "svc-1",
    });

    const created = {
      id: "lr-fail-notif",
      userId: "user-1",
      leaveType: "annual",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-03"),
      totalDays: 3,
      isHalfDay: false,
      reason: null,
      status: "leave_pending",
      serviceId: "svc-1",
      user: { id: "user-1", name: "Mirna", email: "mirna@test.com", avatar: null },
      service: { id: "svc-1", name: "Svc", code: "SVC1" },
    };
    prismaMock.leaveRequest.create.mockResolvedValue(created);
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([{ id: "coord-1" }]);
    prismaMock.userNotification.create.mockRejectedValue(new Error("DB exploded"));

    const req = createRequest("POST", "/api/leave/requests", {
      body: {
        leaveType: "annual",
        startDate: "2026-04-01",
        endDate: "2026-04-03",
      },
    });
    const res = await POST(req);

    // The core leave request must still succeed despite the notification failure.
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/leave/requests/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 404 for unknown leave request", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.leaveRequest.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/leave/requests/unknown-id", {
      body: { status: "leave_approved" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "unknown-id" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Leave request not found");
  });

  it("approves leave request when owner", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const existing = {
      id: "lr-1",
      userId: "user-2",
      leaveType: "annual",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-03"),
      totalDays: 3,
      isHalfDay: false,
      status: "leave_pending",
    };
    prismaMock.leaveRequest.findUnique.mockResolvedValue(existing);

    const updated = {
      ...existing,
      status: "leave_approved",
      reviewedById: "user-1",
      user: { id: "user-2", name: "Staff", email: "staff@test.com", avatar: null },
      reviewedBy: { id: "user-1", name: "Test", email: "test@test.com" },
      service: null,
    };
    prismaMock.leaveRequest.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.userNotification.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/leave/requests/lr-1", {
      body: { status: "leave_approved" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "lr-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("leave_approved");

    // Requester gets a LEAVE_APPROVED notification
    expect(prismaMock.userNotification.create).toHaveBeenCalledTimes(1);
    const notifCall = prismaMock.userNotification.create.mock.calls[0][0];
    expect(notifCall.data.userId).toBe("user-2");
    expect(notifCall.data.type).toBe("leave_approved");
    expect(notifCall.data.title).toBe("Leave approved");
    expect(notifCall.data.link).toBe("/leave?id=lr-1");
  });

  it("rejects leave request when owner", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const existing = {
      id: "lr-1",
      userId: "user-2",
      leaveType: "sick",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-01"),
      totalDays: 1,
      isHalfDay: false,
      status: "leave_pending",
    };
    prismaMock.leaveRequest.findUnique.mockResolvedValue(existing);

    const updated = {
      ...existing,
      status: "leave_rejected",
      reviewedById: "user-1",
      reviewNotes: "Insufficient notice",
      user: { id: "user-2", name: "Staff", email: "staff@test.com", avatar: null },
      reviewedBy: { id: "user-1", name: "Test", email: "test@test.com" },
      service: null,
    };
    prismaMock.leaveRequest.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.userNotification.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/leave/requests/lr-1", {
      body: { status: "leave_rejected", reviewNotes: "Insufficient notice" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "lr-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("leave_rejected");

    // Requester gets a LEAVE_DENIED notification with the review note in the body
    expect(prismaMock.userNotification.create).toHaveBeenCalledTimes(1);
    const notifCall = prismaMock.userNotification.create.mock.calls[0][0];
    expect(notifCall.data.userId).toBe("user-2");
    expect(notifCall.data.type).toBe("leave_denied");
    expect(notifCall.data.title).toBe("Leave denied");
    expect(notifCall.data.body).toContain("Insufficient notice");
  });
});
