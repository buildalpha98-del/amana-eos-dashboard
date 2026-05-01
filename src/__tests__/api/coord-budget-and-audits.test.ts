import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));
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
vi.mock("@/lib/budget-helpers", () => ({
  recalcFinancialsForWeek: vi.fn(() => Promise.resolve()),
  getMonthlyBudget: vi.fn(() => 1000),
}));

import { _clearUserActiveCache } from "@/lib/server-auth";

import { POST as auditsPost } from "@/app/api/audits/route";
import { PATCH as auditPatch } from "@/app/api/audits/[id]/route";
import { PATCH as auditResponsesPatch } from "@/app/api/audits/[id]/responses/route";

import {
  POST as budgetItemPost,
  GET as budgetItemList,
} from "@/app/api/services/[id]/budget/equipment/route";
import {
  PATCH as budgetItemPatch,
  DELETE as budgetItemDelete,
} from "@/app/api/services/[id]/budget/equipment/[itemId]/route";

async function audCtx(id = "aud1") {
  return { params: Promise.resolve({ id }) };
}
async function svcCtx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}
async function budgetItemCtx(id = "s1", itemId = "b1") {
  return { params: Promise.resolve({ id, itemId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("Audits — admin tier allocates, coordinator (own service) completes", () => {
  it("staff CANNOT POST a new audit instance (403)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await auditsPost(
      createRequest("POST", "/api/audits", {
        body: {
          templateId: "t1",
          serviceId: "s1",
          scheduledMonth: 5,
          scheduledYear: 2026,
        },
      }),
    );
    expect(res.status).toBe(403);
  });

  // 2026-04-30: post coordinator-collapse, member is in the audit POST
  // allowlist (`{ roles: ["owner", "head_office", "admin", "member"] }` —
  // see src/app/api/audits/route.ts). The pre-collapse "coordinator
  // CANNOT POST a new audit" assertion is obsolete. Member CAN now
  // create audit instances for their own service. (Note: the route does
  // NOT currently service-scope on POST, so a member at service A could
  // technically create an audit for service B too — flagged separately
  // for a security follow-up.)
  it("member CAN POST a new audit instance for their own service", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.auditTemplate.findUnique.mockResolvedValue({
      id: "t1",
      items: [{ id: "i1" }],
    });
    prismaMock.auditInstance.create.mockResolvedValue({
      id: "aud1",
      template: { name: "Test" },
      service: { id: "s1", name: "S", code: "S" },
      auditor: null,
    });
    prismaMock.auditItemResponse.createMany.mockResolvedValue({ count: 1 });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await auditsPost(
      createRequest("POST", "/api/audits", {
        body: {
          templateId: "t1",
          serviceId: "s1",
          scheduledMonth: 5,
          scheduledYear: 2026,
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  // 2026-05-01: regression guard for the cross-service POST gap discovered
  // while rewriting the SKIP-2026-04-30 tests in PR #43. Member is in the
  // POST allowlist now (so they CAN create audits for their own service),
  // but the route was missing a body-vs-session service comparison, letting
  // them point a POST at any other service's serviceId. ensureCoordCanTouchAudit
  // now runs in both POST and PATCH.
  it("member CANNOT POST a new audit instance for a different service", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s-other",
    });
    const res = await auditsPost(
      createRequest("POST", "/api/audits", {
        body: {
          templateId: "t1",
          serviceId: "s1",
          scheduledMonth: 5,
          scheduledYear: 2026,
        },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("head_office CAN POST a new audit instance", async () => {
    mockSession({ id: "u1", name: "HO", role: "head_office" });
    prismaMock.auditTemplate.findUnique.mockResolvedValue({
      id: "t1",
      items: [{ id: "i1" }],
    });
    prismaMock.auditInstance.create.mockResolvedValue({
      id: "aud1",
      template: { name: "Test" },
      service: { id: "s1", name: "S", code: "S" },
      auditor: null,
    });
    prismaMock.auditItemResponse.createMany.mockResolvedValue({ count: 1 });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await auditsPost(
      createRequest("POST", "/api/audits", {
        body: {
          templateId: "t1",
          serviceId: "s1",
          scheduledMonth: 5,
          scheduledYear: 2026,
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  it("coordinator CAN PATCH an audit on their own service (start it)", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.auditInstance.findUnique.mockResolvedValue({
      id: "aud1",
      serviceId: "s1",
      responses: [],
      template: { responseFormat: "yes_no" },
    });
    prismaMock.auditInstance.update.mockResolvedValue({
      id: "aud1",
      status: "in_progress",
      template: { id: "t1", name: "Audit", qualityArea: 1, nqsReference: "QA1" },
      service: { id: "s1", name: "S", code: "S" },
      auditor: { id: "u1", name: "C" },
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await auditPatch(
      createRequest("PATCH", "/api/audits/aud1", {
        body: { action: "start" },
      }),
      await audCtx(),
    );
    expect(res.status).toBe(200);
  });

  // 2026-04-30: still holds for member — service-scoping is enforced in
  // src/app/api/audits/[id]/route.ts via `ensureCoordOwnService(role,
  // userServiceId, instance.serviceId)`. Renamed coordinator → member.
  it("member CANNOT PATCH an audit on a different service", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s-other",
    });
    prismaMock.auditInstance.findUnique.mockResolvedValue({
      id: "aud1",
      serviceId: "s1",
      responses: [],
      template: { responseFormat: "yes_no" },
    });
    const res = await auditPatch(
      createRequest("PATCH", "/api/audits/aud1", {
        body: { action: "start" },
      }),
      await audCtx(),
    );
    expect(res.status).toBe(403);
  });

  it("coordinator CAN PATCH responses on their own service's audit", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.auditInstance.findUnique.mockResolvedValue({
      id: "aud1",
      serviceId: "s1",
      status: "in_progress",
    });
    prismaMock.auditItemResponse.update.mockResolvedValue({});
    const res = await auditResponsesPatch(
      createRequest("PATCH", "/api/audits/aud1/responses", {
        body: { responses: [{ id: "r1", result: "yes" }] },
      }),
      await audCtx(),
    );
    expect(res.status).toBe(200);
  });

  // 2026-04-30: still holds for member — same `ensureCoordOwnService` gate
  // applies to PATCH /api/audits/[id]/responses.
  it("member CANNOT PATCH responses on another service's audit", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s-other",
    });
    prismaMock.auditInstance.findUnique.mockResolvedValue({
      id: "aud1",
      serviceId: "s1",
      status: "in_progress",
    });
    const res = await auditResponsesPatch(
      createRequest("PATCH", "/api/audits/aud1/responses", {
        body: { responses: [{ id: "r1", result: "yes" }] },
      }),
      await audCtx(),
    );
    expect(res.status).toBe(403);
  });

  it("staff CANNOT PATCH an audit", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await auditPatch(
      createRequest("PATCH", "/api/audits/aud1", {
        body: { action: "start" },
      }),
      await audCtx(),
    );
    expect(res.status).toBe(403);
  });
});

describe("Budget — coordinator (own service) can fill in line items", () => {
  it("coordinator CAN POST a budget item for their own service", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
    prismaMock.budgetItem.create.mockResolvedValue({
      id: "b1",
      name: "Paint",
      amount: 50,
      category: "art_craft",
      date: new Date(),
      createdBy: { id: "u1", name: "C" },
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await budgetItemPost(
      createRequest(
        "POST",
        "/api/services/s1/budget/equipment",
        {
          body: {
            name: "Paint",
            amount: 50,
            category: "art_craft",
            date: "2026-04-25",
          },
        },
      ),
      await svcCtx(),
    );
    expect(res.status).toBe(201);
  });

  // 2026-04-30: still holds for member — `ensureCoordOwnService` gate in
  // src/app/api/services/[id]/budget/route.ts.
  it("member CANNOT POST a budget item for a different service", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s-other",
    });
    const res = await budgetItemPost(
      createRequest(
        "POST",
        "/api/services/s1/budget/equipment",
        {
          body: {
            name: "Paint",
            amount: 50,
            category: "art_craft",
            date: "2026-04-25",
          },
        },
      ),
      await svcCtx(),
    );
    expect(res.status).toBe(403);
  });

  it("coordinator CAN GET equipment list for their own service", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.budgetItem.findMany.mockResolvedValue([]);
    const res = await budgetItemList(
      createRequest("GET", "/api/services/s1/budget/equipment"),
      await svcCtx(),
    );
    expect(res.status).toBe(200);
  });

  it("coordinator CAN PATCH a budget item on their own service", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.budgetItem.findFirst.mockResolvedValue({
      id: "b1",
      serviceId: "s1",
      category: "art_craft",
      notes: "x",
      date: new Date("2026-04-20"),
    });
    prismaMock.budgetItem.update.mockResolvedValue({
      id: "b1",
      createdBy: { id: "u1", name: "C" },
      date: new Date("2026-04-20"),
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await budgetItemPatch(
      createRequest(
        "PATCH",
        "/api/services/s1/budget/equipment/b1",
        { body: { amount: 75 } },
      ),
      await budgetItemCtx(),
    );
    expect(res.status).toBe(200);
  });

  // 2026-04-30: still holds for member — same gate.
  it("member CANNOT DELETE a budget item from a different service", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s-other",
    });
    const res = await budgetItemDelete(
      createRequest("DELETE", "/api/services/s1/budget/equipment/b1"),
      await budgetItemCtx(),
    );
    expect(res.status).toBe(403);
  });

  it("staff CANNOT touch budget", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await budgetItemPost(
      createRequest("POST", "/api/services/s1/budget/equipment", {
        body: {
          name: "Paint",
          amount: 50,
          category: "art_craft",
          date: "2026-04-25",
        },
      }),
      await svcCtx(),
    );
    expect(res.status).toBe(403);
  });

  it("admin CAN edit budget items on any service (no own-service check)", async () => {
    mockSession({ id: "u1", name: "A", role: "admin" });
    prismaMock.budgetItem.findFirst.mockResolvedValue({
      id: "b1",
      serviceId: "s1",
      category: "art_craft",
      notes: "x",
      date: new Date("2026-04-20"),
    });
    prismaMock.budgetItem.update.mockResolvedValue({
      id: "b1",
      createdBy: null,
      date: new Date("2026-04-20"),
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await budgetItemPatch(
      createRequest(
        "PATCH",
        "/api/services/s1/budget/equipment/b1",
        { body: { amount: 75 } },
      ),
      await budgetItemCtx(),
    );
    expect(res.status).toBe(200);
  });
});
