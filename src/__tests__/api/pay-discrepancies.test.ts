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

import { GET, POST } from "@/app/api/pay-discrepancies/route";
import { PATCH } from "@/app/api/pay-discrepancies/[id]/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "staff" });
  prismaMock.activityLog.create.mockResolvedValue({});
  prismaMock.userNotification.createMany.mockResolvedValue({ count: 0 });
  prismaMock.userNotification.create.mockResolvedValue({});
});

describe("GET /api/pay-discrepancies", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/pay-discrepancies"));
    expect(res.status).toBe(401);
  });

  it("scopes staff to their own reports", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    prismaMock.payDiscrepancyReport.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/pay-discrepancies"));
    const call = prismaMock.payDiscrepancyReport.findMany.mock.calls[0][0];
    expect(call.where.reporterId).toBe("staff-1");
  });

  it("admin sees everyone's reports", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.payDiscrepancyReport.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/pay-discrepancies"));
    const call = prismaMock.payDiscrepancyReport.findMany.mock.calls[0][0];
    expect(call.where.reporterId).toBeUndefined();
  });

  it("head_office (state manager) sees everyone's reports", async () => {
    mockSession({ id: "hq-1", name: "State Manager", role: "head_office" });
    prismaMock.payDiscrepancyReport.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/pay-discrepancies"));
    const call = prismaMock.payDiscrepancyReport.findMany.mock.calls[0][0];
    expect(call.where.reporterId).toBeUndefined();
  });
});

describe("POST /api/pay-discrepancies", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/pay-discrepancies", {
        body: { discrepancyDate: "2026-08-01", hoursShort: 3 },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("any authenticated role can submit — marketing included", async () => {
    mockSession({ id: "mk-1", name: "Marketing", role: "marketing" });
    prismaMock.payDiscrepancyReport.create.mockResolvedValue({
      id: "pd-1",
      reporterId: "mk-1",
      discrepancyDate: new Date("2026-08-01"),
      hoursShort: 2.5,
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
    const res = await POST(
      createRequest("POST", "/api/pay-discrepancies", {
        body: { discrepancyDate: "2026-08-01", hoursShort: 2.5, description: "Missed a shift's hours" },
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
  });

  it("returns 400 when hoursShort is not positive", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await POST(
      createRequest("POST", "/api/pay-discrepancies", {
        body: { discrepancyDate: "2026-08-01", hoursShort: 0 },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when discrepancyDate is missing", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await POST(
      createRequest("POST", "/api/pay-discrepancies", { body: { hoursShort: 2 } }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/pay-discrepancies/[id]", () => {
  it("is forbidden for staff", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await PATCH(
      createRequest("PATCH", "/api/pay-discrepancies/pd-1", { body: { status: "resolved" } }),
      ctx("pd-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a non-existent report", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.payDiscrepancyReport.findUnique.mockResolvedValue(null);
    const res = await PATCH(
      createRequest("PATCH", "/api/pay-discrepancies/missing", { body: { status: "resolved" } }),
      ctx("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("resolves a report and notifies the reporter", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.payDiscrepancyReport.findUnique.mockResolvedValue({
      id: "pd-1",
      reporterId: "staff-1",
      resolutionNotes: null,
    });
    prismaMock.payDiscrepancyReport.update.mockResolvedValue({
      id: "pd-1",
      reporterId: "staff-1",
      reporter: { name: "Staff One" },
      status: "resolved",
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/pay-discrepancies/pd-1", {
        body: { status: "resolved", resolutionNotes: "Back-paid in the next run" },
      }),
      ctx("pd-1"),
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.payDiscrepancyReport.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("resolved");
    expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
    expect(prismaMock.userNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "staff-1" }) }),
    );
  });

  it("does not notify when the reviewer is also the reporter", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.payDiscrepancyReport.findUnique.mockResolvedValue({
      id: "pd-1",
      reporterId: "admin-1",
      resolutionNotes: null,
    });
    prismaMock.payDiscrepancyReport.update.mockResolvedValue({
      id: "pd-1",
      reporterId: "admin-1",
      reporter: { name: "Admin" },
      status: "dismissed",
    });
    await PATCH(
      createRequest("PATCH", "/api/pay-discrepancies/pd-1", { body: { status: "dismissed" } }),
      ctx("pd-1"),
    );
    expect(prismaMock.userNotification.create).not.toHaveBeenCalled();
  });

  it("does not set resolvedAt when just starting review", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.payDiscrepancyReport.findUnique.mockResolvedValue({
      id: "pd-1",
      reporterId: "staff-1",
      resolutionNotes: null,
    });
    prismaMock.payDiscrepancyReport.update.mockResolvedValue({
      id: "pd-1",
      reporterId: "staff-1",
      reporter: { name: "Staff One" },
      status: "reviewing",
    });
    await PATCH(
      createRequest("PATCH", "/api/pay-discrepancies/pd-1", { body: { status: "reviewing" } }),
      ctx("pd-1"),
    );
    const updateCall = prismaMock.payDiscrepancyReport.update.mock.calls[0][0];
    expect(updateCall.data.resolvedAt).toBeNull();
    expect(prismaMock.userNotification.create).not.toHaveBeenCalled();
  });
});
