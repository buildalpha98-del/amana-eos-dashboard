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

import { PATCH as AUDIT_PATCH } from "@/app/api/audits/[id]/route";
import { POST as AUDIT_POST } from "@/app/api/audits/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("PATCH /api/audits/[id] — reschedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/audits/a-1", {
      body: { scheduledMonth: 5, scheduledYear: 2026 },
    });
    const res = await AUDIT_PATCH(req, { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-member/admin/owner roles", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const req = createRequest("PATCH", "/api/audits/a-1", {
      body: { scheduledMonth: 5, scheduledYear: 2026 },
    });
    const res = await AUDIT_PATCH(req, { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(403);
  });

  it("updates scheduledMonth and scheduledYear for admin", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.auditInstance.findUnique.mockResolvedValue({
      id: "a-1",
      responses: [],
      template: { responseFormat: "yes_no" },
    });
    prismaMock.auditInstance.update.mockResolvedValue({
      id: "a-1",
      scheduledMonth: 7,
      scheduledYear: 2026,
      template: { id: "t-1", name: "T", qualityArea: 2, nqsReference: null, responseFormat: "yes_no" },
      service: { id: "svc-1", name: "C1", code: "C1" },
      auditor: null,
    });

    const req = createRequest("PATCH", "/api/audits/a-1", {
      body: { scheduledMonth: 7, scheduledYear: 2026 },
    });
    const res = await AUDIT_PATCH(req, { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);

    const updateCall = prismaMock.auditInstance.update.mock.calls[0][0];
    expect(updateCall.data.scheduledMonth).toBe(7);
    expect(updateCall.data.scheduledYear).toBe(2026);
  });

  it("validates scheduledMonth is between 1 and 12", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest("PATCH", "/api/audits/a-1", {
      body: { scheduledMonth: 13 },
    });
    const res = await AUDIT_PATCH(req, { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(400);
  });

  it("accepts a dueDate ISO string", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.auditInstance.findUnique.mockResolvedValue({
      id: "a-1",
      responses: [],
      template: { responseFormat: "yes_no" },
    });
    prismaMock.auditInstance.update.mockResolvedValue({
      id: "a-1",
      dueDate: new Date("2026-07-15"),
      template: { id: "t-1", name: "T", qualityArea: 2, nqsReference: null, responseFormat: "yes_no" },
      service: { id: "svc-1", name: "C1", code: "C1" },
      auditor: null,
    });

    const req = createRequest("PATCH", "/api/audits/a-1", {
      body: { dueDate: "2026-07-15T00:00:00.000Z" },
    });
    const res = await AUDIT_PATCH(req, { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);

    const updateCall = prismaMock.auditInstance.update.mock.calls[0][0];
    expect(updateCall.data.dueDate).toBeInstanceOf(Date);
  });
});

describe("POST /api/audits — create manual instance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/audits", {
      body: { templateId: "t-1", serviceId: "svc-1", scheduledMonth: 5, scheduledYear: 2026 },
    });
    const res = await AUDIT_POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for staff", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const req = createRequest("POST", "/api/audits", {
      body: { templateId: "t-1", serviceId: "svc-1", scheduledMonth: 5, scheduledYear: 2026 },
    });
    const res = await AUDIT_POST(req);
    expect(res.status).toBe(403);
  });

  it("creates an audit instance with default status 'scheduled'", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.auditTemplate.findUnique.mockResolvedValue({
      id: "t-1",
      name: "Template 1",
      items: [{ id: "ti-1" }, { id: "ti-2" }],
    });
    prismaMock.auditInstance.create.mockResolvedValue({
      id: "new-a-1",
      templateId: "t-1",
      serviceId: "svc-1",
      scheduledMonth: 5,
      scheduledYear: 2026,
      status: "scheduled",
      template: { id: "t-1", name: "Template 1", qualityArea: 2, nqsReference: null, responseFormat: "yes_no" },
      service: { id: "svc-1", name: "C1", code: "C1" },
      auditor: null,
    });
    prismaMock.auditItemResponse.createMany.mockResolvedValue({ count: 2 });

    const req = createRequest("POST", "/api/audits", {
      body: {
        templateId: "t-1",
        serviceId: "svc-1",
        scheduledMonth: 5,
        scheduledYear: 2026,
      },
    });
    const res = await AUDIT_POST(req);
    expect(res.status).toBe(201);

    const createCall = prismaMock.auditInstance.create.mock.calls[0][0];
    expect(createCall.data.status).toBe("scheduled");
    expect(createCall.data.templateId).toBe("t-1");
  });

  it("returns 404 when template does not exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.auditTemplate.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/audits", {
      body: { templateId: "bogus", serviceId: "svc-1", scheduledMonth: 5, scheduledYear: 2026 },
    });
    const res = await AUDIT_POST(req);
    expect(res.status).toBe(404);
  });
});
