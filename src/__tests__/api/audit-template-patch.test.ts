import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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

import { PATCH as TEMPLATE_PATCH } from "@/app/api/audits/templates/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("PATCH /api/audits/templates/[id] — respread flag", () => {
  const ctx = { params: Promise.resolve({ id: "tpl-1" }) };
  const today = new Date();
  const futureDate = new Date(today.getFullYear() + 1, 5, 15);
  const pastDate = new Date(today.getFullYear() - 1, 5, 15);

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.activityLog.create.mockResolvedValue({});

    prismaMock.auditTemplate.update.mockResolvedValue({
      id: "tpl-1",
      name: "Template 1",
      scheduledMonths: [3, 9],
      items: [],
      _count: { instances: 0 },
    });
  });

  it("does not respread when respreadFutureInstances is false", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    const req = createRequest(
      "PATCH",
      "/api/audits/templates/tpl-1",
      { body: { scheduledMonths: [3, 9], respreadFutureInstances: false } },
    );
    const res = await TEMPLATE_PATCH(req, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.respread).toBeUndefined();
    expect(prismaMock.auditInstance.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.auditInstance.create).not.toHaveBeenCalled();
  });

  it("does not respread when scheduledMonths is not in the PATCH body", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.auditTemplate.update.mockResolvedValue({
      id: "tpl-1",
      name: "Renamed",
      scheduledMonths: [3, 9],
      items: [],
      _count: { instances: 5 },
    });

    const req = createRequest(
      "PATCH",
      "/api/audits/templates/tpl-1",
      { body: { name: "Renamed", respreadFutureInstances: true } },
    );
    const res = await TEMPLATE_PATCH(req, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.respread).toBeUndefined();
  });

  it("deletes scheduled+future instances off the new months and recreates them when flag set", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.auditTemplate.update.mockResolvedValue({
      id: "tpl-1",
      name: "Template 1",
      scheduledMonths: [3, 9],
      items: [{ id: "i-1" }],
      _count: { instances: 3 },
    });

    // Eligible instances: scheduled, future dueDate, not on new months [3, 9]
    prismaMock.auditInstance.findMany.mockResolvedValue([
      {
        id: "inst-1",
        serviceId: "svc-1",
        scheduledMonth: 5,
        scheduledYear: futureDate.getFullYear(),
        status: "scheduled",
        dueDate: futureDate,
      },
      {
        id: "inst-2",
        serviceId: "svc-2",
        scheduledMonth: 7,
        scheduledYear: futureDate.getFullYear(),
        status: "scheduled",
        dueDate: futureDate,
      },
    ]);

    prismaMock.auditInstance.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.auditInstance.findUnique.mockResolvedValue(null);
    prismaMock.auditInstance.create.mockResolvedValue({});

    const req = createRequest(
      "PATCH",
      "/api/audits/templates/tpl-1",
      { body: { scheduledMonths: [3, 9], respreadFutureInstances: true } },
    );
    const res = await TEMPLATE_PATCH(req, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.respread).toBeDefined();
    expect(data.respread.deleted).toBe(2);
    // 2 services × 2 new months = 4 recreations
    expect(data.respread.recreated).toBe(4);
  });

  it("leaves instances already on the new months alone", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.auditTemplate.update.mockResolvedValue({
      id: "tpl-1",
      name: "Template 1",
      scheduledMonths: [3, 9],
      items: [],
      _count: { instances: 2 },
    });

    // Both instances are already on month 3 — should be left alone
    prismaMock.auditInstance.findMany.mockResolvedValue([
      {
        id: "inst-keep-1",
        serviceId: "svc-1",
        scheduledMonth: 3,
        scheduledYear: futureDate.getFullYear(),
        status: "scheduled",
        dueDate: futureDate,
      },
      {
        id: "inst-keep-2",
        serviceId: "svc-2",
        scheduledMonth: 3,
        scheduledYear: futureDate.getFullYear(),
        status: "scheduled",
        dueDate: futureDate,
      },
    ]);

    // month 3 exists already; month 9 does not
    prismaMock.auditInstance.findUnique.mockImplementation(({ where }: any) => {
      const month = where.templateId_serviceId_scheduledMonth_scheduledYear.scheduledMonth;
      return Promise.resolve(month === 3 ? { id: "existing-m3" } : null);
    });
    prismaMock.auditInstance.create.mockResolvedValue({});
    prismaMock.auditInstance.deleteMany.mockResolvedValue({ count: 0 });

    const req = createRequest(
      "PATCH",
      "/api/audits/templates/tpl-1",
      { body: { scheduledMonths: [3, 9], respreadFutureInstances: true } },
    );
    const res = await TEMPLATE_PATCH(req, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    // Nothing deleted, both services get a recreate for month 9 only
    expect(data.respread.deleted).toBe(0);
    // 2 services × 1 missing month (9, since 3 is already present) = 2
    expect(data.respread.recreated).toBe(2);
  });

  it("returns 409 when rename collides with existing template name", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    const p2002 = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
      meta: { target: ["name"] },
    });
    prismaMock.auditTemplate.update.mockRejectedValue(p2002);

    const req = createRequest(
      "PATCH",
      "/api/audits/templates/tpl-1",
      { body: { name: "Existing Name" } },
    );
    const res = await TEMPLATE_PATCH(req, ctx);
    expect(res.status).toBe(409);
  });
});
