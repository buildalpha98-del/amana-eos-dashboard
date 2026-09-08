import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

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
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));

import { GET, POST } from "@/app/api/onboarding-requests/route";
import { PATCH } from "@/app/api/onboarding-requests/[id]/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const baseRequest = {
  fullName: "Amina Yusuf",
  dateOfBirth: "2000-01-15",
  address: "1 Example St, Adelaide SA 5000",
  targetPosition: "Educator",
  employmentType: "casual",
  awardLevel: "cs1",
  serviceId: "svc-1",
  expectedStartDate: "2026-10-01",
};

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
  prismaMock.activityLog.create.mockResolvedValue({});
  prismaMock.userNotification.createMany.mockResolvedValue({ count: 0 });
});

describe("GET /api/onboarding-requests", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(401);
  });

  it("is forbidden for a member (state manager tier only)", async () => {
    mockSession({ id: "m1", name: "Director", role: "member" });
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(403);
  });

  it("is forbidden for staff", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(403);
  });

  it("head_office (state manager) can list requests", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    prismaMock.newStarterRequest.findMany.mockResolvedValue([]);
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(200);
  });

  it("admin sees the full queue, not just their own submissions", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.newStarterRequest.findMany.mockResolvedValue([
      { id: "r1", requestedById: "someone-else" },
    ]);
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toHaveLength(1);
    const call = prismaMock.newStarterRequest.findMany.mock.calls[0][0];
    expect(call.where.requestedById).toBeUndefined();
  });
});

describe("POST /api/onboarding-requests", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(401);
  });

  it("is forbidden for staff", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    const res = await POST(
      createRequest("POST", "/api/onboarding-requests", { body: { fullName: "Only a name" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a custom award level with no label", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
    const res = await POST(
      createRequest("POST", "/api/onboarding-requests", {
        body: { ...baseRequest, awardLevel: "custom" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the service doesn't exist", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(400);
  });

  it("state manager can create a request, which notifies admin-tier users", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
    prismaMock.newStarterRequest.create.mockResolvedValue({
      id: "r-new",
      fullName: "Amina Yusuf",
      requestedById: "hq1",
      serviceId: "svc-1",
    });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "owner-1" },
      { id: "hq1" },
      { id: "admin-1" },
    ]);

    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(201);
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
    // The submitter (hq1) is excluded from their own notification.
    const notifyCall = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(notifyCall.data.map((d: { userId: string }) => d.userId)).toEqual(["owner-1", "admin-1"]);
  });
});

describe("PATCH /api/onboarding-requests/[id]", () => {
  beforeEach(() => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
  });

  it("returns 404 for a non-existent request", async () => {
    prismaMock.newStarterRequest.findUnique.mockResolvedValue(null);
    const res = await PATCH(
      createRequest("PATCH", "/api/onboarding-requests/missing", { body: { claim: true } }),
      ctx("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for an already-completed request", async () => {
    prismaMock.newStarterRequest.findUnique.mockResolvedValue({ id: "r1", status: "completed", assignedAdminId: null });
    const res = await PATCH(
      createRequest("PATCH", "/api/onboarding-requests/r1", { body: { claim: true } }),
      ctx("r1"),
    );
    expect(res.status).toBe(400);
  });

  it("claims a request", async () => {
    prismaMock.newStarterRequest.findUnique.mockResolvedValue({ id: "r1", status: "pending", assignedAdminId: null });
    prismaMock.newStarterRequest.update.mockResolvedValue({ id: "r1", status: "pending", assignedAdminId: "admin-1" });
    const res = await PATCH(
      createRequest("PATCH", "/api/onboarding-requests/r1", { body: { claim: true } }),
      ctx("r1"),
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.newStarterRequest.update.mock.calls[0][0];
    expect(updateCall.data.assignedAdminId).toBe("admin-1");
  });

  it("marks a request completed and links the produced account", async () => {
    prismaMock.newStarterRequest.findUnique.mockResolvedValue({ id: "r1", status: "pending", assignedAdminId: null });
    // Must include active:true — withApiAuth's own session-user lookup
    // shares this same mock, and would otherwise 401 the request.
    prismaMock.user.findUnique.mockResolvedValue({ id: "new-user-1", active: true });
    prismaMock.newStarterRequest.update.mockResolvedValue({
      id: "r1",
      status: "completed",
      completedUserId: "new-user-1",
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/onboarding-requests/r1", {
        body: { markCompleted: true, completedUserId: "new-user-1" },
      }),
      ctx("r1"),
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.newStarterRequest.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("completed");
    expect(updateCall.data.completedUserId).toBe("new-user-1");
    expect(updateCall.data.completedById).toBe("admin-1");
  });

  it("cancels a request", async () => {
    prismaMock.newStarterRequest.findUnique.mockResolvedValue({ id: "r1", status: "pending", assignedAdminId: null });
    prismaMock.newStarterRequest.update.mockResolvedValue({ id: "r1", status: "cancelled" });
    const res = await PATCH(
      createRequest("PATCH", "/api/onboarding-requests/r1", { body: { status: "cancelled" } }),
      ctx("r1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.newStarterRequest.update.mock.calls[0][0].data.status).toBe("cancelled");
  });

  it("is forbidden for staff", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await PATCH(
      createRequest("PATCH", "/api/onboarding-requests/r1", { body: { claim: true } }),
      ctx("r1"),
    );
    expect(res.status).toBe(403);
  });
});
