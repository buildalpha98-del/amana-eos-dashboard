import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock Prisma ──────────────────────────────────────────────
vi.mock("@/lib/prisma", () => {
  const fn = vi.fn;
  const models = {
    service: { findUnique: fn() },
    dailyChecklist: {
      upsert: fn(), findMany: fn(), findFirst: fn(), findUnique: fn(), update: fn(),
    },
    dailyChecklistItem: { createMany: fn(), deleteMany: fn(), update: fn() },
    schoolComm: { create: fn(), findMany: fn() },
    auditTemplate: { findUnique: fn() },
    auditInstance: { upsert: fn() },
    auditItemResponse: { upsert: fn() },
    holidayQuestDay: { upsert: fn(), findMany: fn() },
  };
  return {
    prisma: {
      ...models,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: fn().mockImplementation((cb: any) => cb(models)),
    },
  };
});

// ── Mock Auth ────────────────────────────────────────────────
vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(() => null), // auth passes by default
}));

vi.mock("@/lib/server-auth", () => {
  const mockSession = { user: { id: "user-123", name: "Test", role: "owner" } };
  return {
    requireAuth: vi.fn(() =>
      Promise.resolve({ session: mockSession, error: null })
    ),
    withApiAuth: vi.fn((handler: Function) => {
      return async (req: any, context?: any) => {
        return handler(req, mockSession, context);
      };
    }),
  };
});

import { prisma } from "@/lib/prisma";

// ── Helper ───────────────────────────────────────────────────
function makeReq(
  url: string,
  method: string = "GET",
  body?: Record<string, unknown>
) {
  const init: RequestInit = { method, headers: { Authorization: "Bearer test-key" } };
  if (body) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  return new NextRequest(new URL(url, "http://localhost"), init);
}

const SERVICE = { id: "svc-1", name: "Test Centre" };

// ══════════════════════════════════════════════════════════════
// Checklists — Cowork POST
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/services/[serviceCode]/checklists", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for unknown service", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { POST } = await import(
      "@/app/api/cowork/services/[serviceCode]/checklists/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/services/UNKNOWN/checklists", "POST", {
        date: "2026-03-16",
        sessionType: "asc",
        items: [],
      }),
      { params: Promise.resolve({ serviceCode: "UNKNOWN" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when date is missing", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(SERVICE);

    const { POST } = await import(
      "@/app/api/cowork/services/[serviceCode]/checklists/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/services/TST/checklists", "POST", {
        items: [],
      }),
      { params: Promise.resolve({ serviceCode: "TST" }) }
    );
    expect(res.status).toBe(400);
  });

  it("creates checklist with items on valid input", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(SERVICE);
    (prisma.dailyChecklist.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cl-1",
      serviceId: "svc-1",
      date: new Date("2026-03-16"),
      sessionType: "asc",
      status: "pending",
    });
    (prisma.dailyChecklistItem.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });
    (prisma.dailyChecklistItem.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2,
    });

    const { POST } = await import(
      "@/app/api/cowork/services/[serviceCode]/checklists/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/services/TST/checklists", "POST", {
        date: "2026-03-16",
        sessionType: "asc",
        items: [
          { category: "Safety", label: "Check exits", sortOrder: 1 },
          { category: "Safety", label: "First aid kit", sortOrder: 2 },
        ],
      }),
      { params: Promise.resolve({ serviceCode: "TST" }) }
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.checklistId).toBe("cl-1");
  });
});

// ══════════════════════════════════════════════════════════════
// Comms — Cowork POST
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/services/[serviceCode]/comms", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when type is invalid", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(SERVICE);

    const { POST } = await import(
      "@/app/api/cowork/services/[serviceCode]/comms/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/services/TST/comms", "POST", {
        type: "invalid_type",
        subject: "Test",
        body: "Content",
      }),
      { params: Promise.resolve({ serviceCode: "TST" }) }
    );
    expect(res.status).toBe(400);
  });

  it("creates comm in draft status", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(SERVICE);
    (prisma.schoolComm.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "comm-1",
      type: "newsletter",
      subject: "Week 3 Newsletter",
      status: "draft",
    });

    const { POST } = await import(
      "@/app/api/cowork/services/[serviceCode]/comms/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/services/TST/comms", "POST", {
        type: "newsletter",
        subject: "Week 3 Newsletter",
        body: "<p>Hello parents...</p>",
        termWeek: 3,
      }),
      { params: Promise.resolve({ serviceCode: "TST" }) }
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe("draft");
    expect(data.type).toBe("newsletter");
  });
});

// ══════════════════════════════════════════════════════════════
// Audits — Cowork POST
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/services/[serviceCode]/audits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for unknown template", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(SERVICE);
    (prisma.auditTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { POST } = await import(
      "@/app/api/cowork/services/[serviceCode]/audits/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/services/TST/audits", "POST", {
        templateName: "Non-Existent Template",
        scheduledMonth: 3,
        scheduledYear: 2026,
      }),
      { params: Promise.resolve({ serviceCode: "TST" }) }
    );
    expect(res.status).toBe(404);
  });

  it("creates audit instance with compliance score", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(SERVICE);
    (prisma.auditTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tmpl-1",
      name: "Safety Audit",
      items: [
        { id: "item-1", sortOrder: 0 },
        { id: "item-2", sortOrder: 1 },
      ],
    });
    (prisma.auditInstance.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "audit-1",
      status: "completed",
      complianceScore: 100,
    });
    (prisma.auditItemResponse.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const { POST } = await import(
      "@/app/api/cowork/services/[serviceCode]/audits/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/services/TST/audits", "POST", {
        templateName: "Safety Audit",
        scheduledMonth: 3,
        scheduledYear: 2026,
        status: "completed",
        responses: [
          { sortOrder: 0, result: "yes" },
          { sortOrder: 1, result: "yes" },
        ],
      }),
      { params: Promise.resolve({ serviceCode: "TST" }) }
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.complianceScore).toBe(100);
  });
});

// ══════════════════════════════════════════════════════════════
// Holiday Quest — Cowork POST
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/services/[serviceCode]/holiday-quest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when required fields missing", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(SERVICE);

    const { POST } = await import(
      "@/app/api/cowork/services/[serviceCode]/holiday-quest/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/services/TST/holiday-quest", "POST", {
        date: "2026-04-07",
        theme: "Art Day",
        // missing morningActivity and afternoonActivity
      }),
      { params: Promise.resolve({ serviceCode: "TST" }) }
    );
    expect(res.status).toBe(400);
  });

  it("creates holiday quest day", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(SERVICE);
    (prisma.holidayQuestDay.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "hq-1",
      date: new Date("2026-04-07"),
      theme: "Art Day",
      status: "draft",
    });

    const { POST } = await import(
      "@/app/api/cowork/services/[serviceCode]/holiday-quest/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/services/TST/holiday-quest", "POST", {
        date: "2026-04-07",
        theme: "Art Day",
        morningActivity: "Painting workshop",
        afternoonActivity: "Sculpture with clay",
        isExcursion: false,
        maxCapacity: 30,
      }),
      { params: Promise.resolve({ serviceCode: "TST" }) }
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.theme).toBe("Art Day");
    expect(data.status).toBe("draft");
  });
});

// ══════════════════════════════════════════════════════════════
// Dashboard Checklist PATCH
// ══════════════════════════════════════════════════════════════
describe("PATCH /api/services/[id]/checklists/[checklistId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for non-existent checklist", async () => {
    (prisma.dailyChecklist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { PATCH } = await import(
      "@/app/api/services/[id]/checklists/[checklistId]/route"
    );
    const res = await PATCH(
      makeReq("http://localhost/api/services/svc-1/checklists/cl-999", "PATCH", {
        itemId: "item-1",
        checked: true,
      }),
      { params: Promise.resolve({ id: "svc-1", checklistId: "cl-999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("toggles a checklist item", async () => {
    const mockChecklist = {
      id: "cl-1",
      serviceId: "svc-1",
      status: "pending",
      items: [{ id: "item-1", checked: false, isRequired: true }],
    };
    (prisma.dailyChecklist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockChecklist
    );
    (prisma.dailyChecklistItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.dailyChecklist.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ...mockChecklist,
        items: [{ id: "item-1", checked: true, isRequired: true }],
      })
      .mockResolvedValueOnce({
        ...mockChecklist,
        status: "completed",
        items: [{ id: "item-1", checked: true, isRequired: true }],
      });
    (prisma.dailyChecklist.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const { PATCH } = await import(
      "@/app/api/services/[id]/checklists/[checklistId]/route"
    );
    const res = await PATCH(
      makeReq("http://localhost/api/services/svc-1/checklists/cl-1", "PATCH", {
        itemId: "item-1",
        checked: true,
      }),
      { params: Promise.resolve({ id: "svc-1", checklistId: "cl-1" }) }
    );
    expect(res.status).toBe(200);
  });
});
