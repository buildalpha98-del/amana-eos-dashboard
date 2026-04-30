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
import { GET } from "@/app/api/team/action-counts/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/team/action-counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/team/action-counts");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("admin sees org-wide counts (no scoping in Prisma where clause)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.complianceCertificate.count.mockResolvedValue(5);
    prismaMock.leaveRequest.count.mockResolvedValue(3);
    prismaMock.timesheet.count.mockResolvedValue(7);
    prismaMock.shiftSwapRequest.count.mockResolvedValue(2);
    prismaMock.weeklyPulse.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/team/action-counts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      certsExpiring: 5,
      leavePending: 3,
      timesheetsPending: 7,
      shiftSwapsPending: 2,
      pulsesConcerning: 0,
    });

    // Verify no serviceId scoping applied for admin
    const certCall = prismaMock.complianceCertificate.count.mock.calls[0][0];
    expect(certCall.where.serviceId).toBeUndefined();

    const tsCall = prismaMock.timesheet.count.mock.calls[0][0];
    expect(tsCall.where.serviceId).toBeUndefined();
    expect(tsCall.where.status).toBe("submitted");

    const leaveCall = prismaMock.leaveRequest.count.mock.calls[0][0];
    expect(leaveCall.where.status).toBe("leave_pending");
    expect(leaveCall.where.user).toBeUndefined();

    // Verify no shift scoping for admin
    const swapCall = prismaMock.shiftSwapRequest.count.mock.calls[0][0];
    expect(swapCall.where.status).toBe("accepted");
    expect(swapCall.where.shift).toBeUndefined();
  });

  it("coordinator sees service-scoped counts", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "coordinator",
      serviceId: "svc-1",
    });

    prismaMock.complianceCertificate.count.mockResolvedValue(2);
    prismaMock.leaveRequest.count.mockResolvedValue(1);
    prismaMock.timesheet.count.mockResolvedValue(4);
    prismaMock.shiftSwapRequest.count.mockResolvedValue(3);
    prismaMock.weeklyPulse.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/team/action-counts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      certsExpiring: 2,
      leavePending: 1,
      timesheetsPending: 4,
      shiftSwapsPending: 3,
      pulsesConcerning: 0,
    });

    // Verify service-scoped filter applied
    const certCall = prismaMock.complianceCertificate.count.mock.calls[0][0];
    expect(certCall.where.serviceId).toBe("svc-1");

    const tsCall = prismaMock.timesheet.count.mock.calls[0][0];
    expect(tsCall.where.serviceId).toBe("svc-1");
    expect(tsCall.where.status).toBe("submitted");

    const leaveCall = prismaMock.leaveRequest.count.mock.calls[0][0];
    expect(leaveCall.where.user).toEqual({ serviceId: "svc-1" });

    // Verify shift swap scoped via shift.serviceId relation
    const swapCall = prismaMock.shiftSwapRequest.count.mock.calls[0][0];
    expect(swapCall.where.status).toBe("accepted");
    expect(swapCall.where.shift).toEqual({ serviceId: "svc-1" });
  });

  it("owner sees org-wide counts (no scoping)", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });

    prismaMock.complianceCertificate.count.mockResolvedValue(10);
    prismaMock.leaveRequest.count.mockResolvedValue(0);
    prismaMock.timesheet.count.mockResolvedValue(0);
    prismaMock.shiftSwapRequest.count.mockResolvedValue(0);
    prismaMock.weeklyPulse.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/team/action-counts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certsExpiring).toBe(10);
    expect(body.shiftSwapsPending).toBe(0);

    const certCall = prismaMock.complianceCertificate.count.mock.calls[0][0];
    expect(certCall.where.serviceId).toBeUndefined();
  });

  it("head_office sees org-wide counts (no scoping)", async () => {
    mockSession({ id: "ho-1", name: "HO", role: "head_office" });

    prismaMock.complianceCertificate.count.mockResolvedValue(0);
    prismaMock.leaveRequest.count.mockResolvedValue(0);
    prismaMock.timesheet.count.mockResolvedValue(0);
    prismaMock.shiftSwapRequest.count.mockResolvedValue(0);
    prismaMock.weeklyPulse.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/team/action-counts");
    const res = await GET(req);

    expect(res.status).toBe(200);

    const certCall = prismaMock.complianceCertificate.count.mock.calls[0][0];
    expect(certCall.where.serviceId).toBeUndefined();
  });

  it("staff user gets counts scoped to their serviceId (widget hides client-side)", async () => {
    mockSession({
      id: "staff-1",
      name: "Staff",
      role: "staff",
      serviceId: "svc-2",
    });

    prismaMock.complianceCertificate.count.mockResolvedValue(1);
    prismaMock.leaveRequest.count.mockResolvedValue(0);
    prismaMock.timesheet.count.mockResolvedValue(0);
    prismaMock.shiftSwapRequest.count.mockResolvedValue(0);
    prismaMock.weeklyPulse.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/team/action-counts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      certsExpiring: 1,
      leavePending: 0,
      timesheetsPending: 0,
      shiftSwapsPending: 0,
      pulsesConcerning: 0,
    });

    // Non-admin roles get scoped by serviceId
    const certCall = prismaMock.complianceCertificate.count.mock.calls[0][0];
    expect(certCall.where.serviceId).toBe("svc-2");
  });

  it("non-admin with no serviceId gets no service filter (all counts will be unscoped; widget hides anyway)", async () => {
    mockSession({
      id: "member-1",
      name: "Member",
      role: "member",
      serviceId: null,
    });

    prismaMock.complianceCertificate.count.mockResolvedValue(0);
    prismaMock.leaveRequest.count.mockResolvedValue(0);
    prismaMock.timesheet.count.mockResolvedValue(0);
    prismaMock.shiftSwapRequest.count.mockResolvedValue(0);
    prismaMock.weeklyPulse.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/team/action-counts");
    const res = await GET(req);

    expect(res.status).toBe(200);

    // scopedServiceId resolves to null → spread is skipped → no filter applied
    const certCall = prismaMock.complianceCertificate.count.mock.calls[0][0];
    expect(certCall.where.serviceId).toBeUndefined();
  });

  it("returns pulsesConcerning for admin (org-wide, mood<=2, current week filter)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.complianceCertificate.count.mockResolvedValue(0);
    prismaMock.leaveRequest.count.mockResolvedValue(0);
    prismaMock.timesheet.count.mockResolvedValue(0);
    prismaMock.shiftSwapRequest.count.mockResolvedValue(0);
    prismaMock.weeklyPulse.count.mockResolvedValue(3);

    const res = await GET(createRequest("GET", "/api/team/action-counts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pulsesConcerning).toBe(3);

    const call = prismaMock.weeklyPulse.count.mock.calls[0][0];
    expect(call.where.mood).toEqual({ lte: 2 });
    expect(call.where.submittedAt).toEqual({ not: null });
    expect(call.where.weekOf?.gte).toBeInstanceOf(Date);
    expect(call.where.user).toBeUndefined();
  });

  it("scopes pulsesConcerning for coordinator via user.serviceId", async () => {
    mockSession({ id: "u2", name: "Coord", role: "coordinator", serviceId: "svc-1" });
    prismaMock.complianceCertificate.count.mockResolvedValue(0);
    prismaMock.leaveRequest.count.mockResolvedValue(0);
    prismaMock.timesheet.count.mockResolvedValue(0);
    prismaMock.shiftSwapRequest.count.mockResolvedValue(0);
    prismaMock.weeklyPulse.count.mockResolvedValue(1);

    const res = await GET(createRequest("GET", "/api/team/action-counts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pulsesConcerning).toBe(1);

    const call = prismaMock.weeklyPulse.count.mock.calls[0][0];
    expect(call.where.user).toEqual({ serviceId: "svc-1" });
  });
});
