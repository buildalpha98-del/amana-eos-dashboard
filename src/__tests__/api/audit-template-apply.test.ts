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

import { POST as APPLY_POST } from "@/app/api/audits/templates/[id]/apply/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("POST /api/audits/templates/[id]/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  const validBody = {
    serviceIds: ["svc-1", "svc-2"],
    year: 2026,
  };

  const ctx = { params: Promise.resolve({ id: "tpl-1" }) };

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: validBody },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: validBody },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when serviceIds is empty", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: { serviceIds: [], year: 2026 } },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid month values", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: { ...validBody, months: [13] } },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when template does not exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.auditTemplate.findUnique.mockResolvedValue(null);
    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: validBody },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it("creates instances for valid services × template scheduledMonths", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.auditTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      name: "Template 1",
      scheduledMonths: [3, 9],
      items: [{ id: "i-1" }, { id: "i-2" }],
    });

    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", name: "Service 1", status: "active" },
      { id: "svc-2", name: "Service 2", status: "active" },
    ]);

    prismaMock.auditInstance.findUnique.mockResolvedValue(null);
    prismaMock.auditInstance.create.mockResolvedValue({});

    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: validBody },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    // 2 services × 2 months = 4 instances
    expect(data.created).toBe(4);
    expect(data.skipped).toBe(0);
    expect(data.total).toBe(4);
    expect(data.serviceIds).toEqual(["svc-1", "svc-2"]);
    expect(prismaMock.auditInstance.create).toHaveBeenCalledTimes(4);
  });

  it("skips existing instances instead of duplicating", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.auditTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      name: "Template 1",
      scheduledMonths: [6],
      items: [],
    });

    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", name: "Service 1", status: "active" },
    ]);

    // Existing instance returned
    prismaMock.auditInstance.findUnique.mockResolvedValue({ id: "existing" });

    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: { serviceIds: ["svc-1"], year: 2026 } },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.created).toBe(0);
    expect(data.skipped).toBe(1);
    expect(prismaMock.auditInstance.create).not.toHaveBeenCalled();
  });

  it("respects months override when provided", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.auditTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      name: "Template 1",
      scheduledMonths: [1, 7], // template defaults
      items: [],
    });

    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", name: "Service 1", status: "active" },
    ]);

    prismaMock.auditInstance.findUnique.mockResolvedValue(null);
    prismaMock.auditInstance.create.mockResolvedValue({});

    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: { serviceIds: ["svc-1"], year: 2026, months: [3, 4, 5] } },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.created).toBe(3); // 1 service × 3 months override
    expect(prismaMock.auditInstance.create).toHaveBeenCalledTimes(3);
  });

  it("filters unknown / inactive services into unknownServiceIds", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.auditTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      name: "Template 1",
      scheduledMonths: [5],
      items: [],
    });

    // Only svc-1 is active; svc-ghost is missing
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", name: "Service 1", status: "active" },
    ]);

    prismaMock.auditInstance.findUnique.mockResolvedValue(null);
    prismaMock.auditInstance.create.mockResolvedValue({});

    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: { serviceIds: ["svc-1", "svc-ghost"], year: 2026 } },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.created).toBe(1);
    expect(data.serviceIds).toEqual(["svc-1"]);
    expect(data.unknownServiceIds).toEqual(["svc-ghost"]);
  });

  it("creates instances with totalItems: 0 when template has no items", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.auditTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      name: "Template 1",
      scheduledMonths: [4],
      items: [], // no checklist items yet
    });

    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", name: "Service 1", status: "active" },
    ]);

    prismaMock.auditInstance.findUnique.mockResolvedValue(null);
    prismaMock.auditInstance.create.mockResolvedValue({});

    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: { serviceIds: ["svc-1"], year: 2026 } },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.created).toBe(1);

    const createCall = prismaMock.auditInstance.create.mock.calls[0][0];
    expect(createCall.data.totalItems).toBe(0);
    // No responses seeded when template has no items
    expect(createCall.data.responses.create).toEqual([]);
  });

  it("writes an ActivityLog entry on success", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.auditTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      name: "Template 1",
      scheduledMonths: [2],
      items: [],
    });

    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", name: "Service 1", status: "active" },
    ]);

    prismaMock.auditInstance.findUnique.mockResolvedValue(null);
    prismaMock.auditInstance.create.mockResolvedValue({});

    const req = createRequest(
      "POST",
      "/api/audits/templates/tpl-1/apply",
      { body: { serviceIds: ["svc-1"], year: 2026 } },
    );
    const res = await APPLY_POST(req, ctx);
    expect(res.status).toBe(200);

    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "apply",
          entityType: "AuditTemplate",
          entityId: "tpl-1",
        }),
      }),
    );
  });
});
