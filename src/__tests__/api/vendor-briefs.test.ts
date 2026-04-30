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
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { POST as POST_CREATE } from "@/app/api/marketing/vendor-briefs/route";
import { POST as POST_TRANSITION } from "@/app/api/marketing/vendor-briefs/[id]/transition/route";
import { POST as POST_ESCALATE } from "@/app/api/marketing/vendor-briefs/[id]/escalate/route";
import { POST as POST_CLEAR } from "@/app/api/marketing/vendor-briefs/[id]/clear-escalation/route";
import { POST as POST_SEED } from "@/app/api/marketing/vendor-briefs/term-readiness/seed/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = (id: string) =>
  ({ params: Promise.resolve({ id }) }) as never;

const baseBrief = {
  id: "vb1",
  briefNumber: "VB-2026-0001",
  title: "Greystanes posters",
  type: "print_collateral",
  status: "draft",
  serviceId: "svc1",
  service: { id: "svc1", name: "Greystanes", state: "NSW" },
  vendorContactId: null,
  vendorContact: null,
  ownerId: "m1",
  owner: { id: "m1", name: "Akram" },
  briefBody: null,
  specifications: null,
  quantity: null,
  deliveryAddress: null,
  notes: null,
  termReadinessCategory: null,
  termYear: null,
  termNumber: null,
  briefSentAt: null,
  acknowledgedAt: null,
  quoteReceivedAt: null,
  quoteApprovedAt: null,
  approvedAt: null,
  orderedAt: null,
  deliveredAt: null,
  installedAt: null,
  deliveryDeadline: null,
  targetTermStart: null,
  escalatedAt: null,
  escalatedToUserId: null,
  escalatedTo: null,
  escalationReason: null,
  cancellationReason: null,
  vendorName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/marketing/vendor-briefs (create)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "m1")
        return { id: "m1", role: "marketing", active: true };
      if (args?.where?.id === "c1")
        return { id: "c1", role: "member", active: true };
      return null;
    });
  });

  it("returns 403 for coordinator role", async () => {
    mockSession({ id: "c1", name: "Coord", role: "member" });
    const res = await POST_CREATE(
      createRequest("POST", "/api/marketing/vendor-briefs", {
        body: { title: "Test", type: "print_collateral" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("creates a brief with auto-generated briefNumber", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.count.mockResolvedValue(41);
    prismaMock.vendorBrief.create.mockResolvedValue({
      ...baseBrief,
      briefNumber: "VB-2026-0042",
      title: "Greystanes posters",
    });

    const res = await POST_CREATE(
      createRequest("POST", "/api/marketing/vendor-briefs", {
        body: {
          title: "Greystanes posters",
          type: "print_collateral",
          serviceId: "svc1",
        },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.brief.briefNumber).toBe("VB-2026-0042");

    // Owner is set to session user
    const callArg = prismaMock.vendorBrief.create.mock.calls[0][0] as {
      data: { ownerId: string; status: string };
    };
    expect(callArg.data.ownerId).toBe("m1");
    expect(callArg.data.status).toBe("draft");
  });

  it("rejects partial term-readiness fields", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });

    const res = await POST_CREATE(
      createRequest("POST", "/api/marketing/vendor-briefs", {
        body: {
          title: "x",
          type: "print_collateral",
          termYear: 2026,
          // missing termNumber + termReadinessCategory
        },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/marketing/vendor-briefs/[id]/transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "m1")
        return { id: "m1", role: "marketing", active: true };
      return null;
    });
  });

  it("draft → brief_sent sets briefSentAt", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      status: "draft",
      briefSentAt: null,
      acknowledgedAt: null,
      quoteReceivedAt: null,
      quoteApprovedAt: null,
      approvedAt: null,
      orderedAt: null,
      deliveredAt: null,
      installedAt: null,
    });
    prismaMock.vendorBrief.update.mockResolvedValue({
      ...baseBrief,
      status: "brief_sent",
      briefSentAt: new Date("2026-04-25T10:00:00Z"),
    });

    const res = await POST_TRANSITION(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/transition", {
        body: { toStatus: "brief_sent", occurredAt: "2026-04-25T10:00:00Z" },
      }),
      ctx("vb1"),
    );

    expect(res.status).toBe(200);
    const updateCall = prismaMock.vendorBrief.update.mock.calls[0][0] as {
      data: { briefSentAt: Date; status: string };
    };
    expect(updateCall.data.status).toBe("brief_sent");
    expect(updateCall.data.briefSentAt).toBeInstanceOf(Date);
  });

  it("draft → quote_received fills intermediate timestamps", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      status: "draft",
      briefSentAt: null,
      acknowledgedAt: null,
      quoteReceivedAt: null,
      quoteApprovedAt: null,
      approvedAt: null,
      orderedAt: null,
      deliveredAt: null,
      installedAt: null,
    });
    prismaMock.vendorBrief.update.mockResolvedValue({
      ...baseBrief,
      status: "quote_received",
    });

    const at = "2026-04-25T10:00:00Z";
    await POST_TRANSITION(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/transition", {
        body: { toStatus: "quote_received", occurredAt: at },
      }),
      ctx("vb1"),
    );

    const updateCall = prismaMock.vendorBrief.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // Skip-forward: all earlier timestamps are filled with the same value
    expect(updateCall.data.briefSentAt).toBeInstanceOf(Date);
    expect(updateCall.data.acknowledgedAt).toBeInstanceOf(Date);
    expect(updateCall.data.quoteReceivedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid backward transition (delivered → draft)", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      status: "delivered",
      briefSentAt: new Date(),
      acknowledgedAt: new Date(),
      quoteReceivedAt: new Date(),
      quoteApprovedAt: new Date(),
      approvedAt: new Date(),
      orderedAt: new Date(),
      deliveredAt: new Date(),
      installedAt: null,
    });

    const res = await POST_TRANSITION(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/transition", {
        body: { toStatus: "draft" },
      }),
      ctx("vb1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.vendorBrief.update).not.toHaveBeenCalled();
  });

  it("requires cancellation reason in notes when toStatus is cancelled", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      status: "approved",
      briefSentAt: new Date(),
      acknowledgedAt: new Date(),
      quoteReceivedAt: new Date(),
      quoteApprovedAt: new Date(),
      approvedAt: new Date(),
      orderedAt: null,
      deliveredAt: null,
      installedAt: null,
    });

    const res = await POST_TRANSITION(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/transition", {
        body: { toStatus: "cancelled" },
      }),
      ctx("vb1"),
    );
    expect(res.status).toBe(400);
  });

  it("appends to existing notes on non-cancellation transition (preserves prior content)", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      type: "print_collateral",
      status: "awaiting_quote",
      notes: "Earlier ops note from yesterday",
      briefSentAt: new Date(),
      acknowledgedAt: new Date(),
      quoteReceivedAt: null,
      quoteApprovedAt: null,
      approvedAt: null,
      orderedAt: null,
      deliveredAt: null,
      installedAt: null,
    });
    prismaMock.vendorBrief.update.mockResolvedValue({
      ...baseBrief,
      status: "quote_received",
    });

    await POST_TRANSITION(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/transition", {
        body: {
          toStatus: "quote_received",
          notes: "Quote came back at $1,200",
        },
      }),
      ctx("vb1"),
    );

    const updateCall = prismaMock.vendorBrief.update.mock.calls[0][0] as {
      data: { notes: string };
    };
    expect(updateCall.data.notes).toContain("Earlier ops note from yesterday");
    expect(updateCall.data.notes).toContain("Quote came back at $1,200");
  });

  it("rejects 'installed' for non-signage briefs (server-side guard)", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      type: "uniform",
      status: "delivered",
      notes: null,
      briefSentAt: new Date(),
      acknowledgedAt: new Date(),
      quoteReceivedAt: new Date(),
      quoteApprovedAt: new Date(),
      approvedAt: new Date(),
      orderedAt: new Date(),
      deliveredAt: new Date(),
      installedAt: null,
    });

    const res = await POST_TRANSITION(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/transition", {
        body: { toStatus: "installed" },
      }),
      ctx("vb1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.vendorBrief.update).not.toHaveBeenCalled();
  });

  it("permits head_office role on transition (widened from marketing+owner)", async () => {
    prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "h1")
        return { id: "h1", role: "head_office", active: true };
      return null;
    });
    mockSession({ id: "h1", name: "Daniel", role: "head_office" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      type: "print_collateral",
      status: "draft",
      notes: null,
      briefSentAt: null,
      acknowledgedAt: null,
      quoteReceivedAt: null,
      quoteApprovedAt: null,
      approvedAt: null,
      orderedAt: null,
      deliveredAt: null,
      installedAt: null,
    });
    prismaMock.vendorBrief.update.mockResolvedValue({
      ...baseBrief,
      status: "brief_sent",
    });

    const res = await POST_TRANSITION(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/transition", {
        body: { toStatus: "brief_sent" },
      }),
      ctx("vb1"),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/marketing/vendor-briefs/[id]/escalate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "m1")
        return { id: "m1", role: "marketing", active: true };
      return null;
    });
  });

  it("creates a MarketingTask and stamps escalation fields", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      briefNumber: "VB-2026-0001",
      title: "Test",
      serviceId: "svc1",
    });
    prismaMock.user.findFirst.mockResolvedValue({ id: "owner1" });
    prismaMock.vendorBrief.update.mockResolvedValue({
      ...baseBrief,
      escalatedAt: new Date(),
      escalatedToUserId: "owner1",
      escalationReason: "No response 5 days",
    });
    prismaMock.marketingTask.create.mockResolvedValue({
      id: "task1",
    });

    const res = await POST_ESCALATE(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/escalate", {
        body: { reason: "No response 5 days" },
      }),
      ctx("vb1"),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.marketingTask.create).toHaveBeenCalledTimes(1);
    const taskCall = prismaMock.marketingTask.create.mock.calls[0][0] as {
      data: { title: string; assigneeId: string; priority: string };
    };
    expect(taskCall.data.title).toContain("[Escalated]");
    expect(taskCall.data.title).toContain("VB-2026-0001");
    expect(taskCall.data.assigneeId).toBe("owner1");
    expect(taskCall.data.priority).toBe("high");
  });

  it("requires a reason", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    const res = await POST_ESCALATE(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/escalate", {
        body: {},
      }),
      ctx("vb1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/marketing/vendor-briefs/[id]/clear-escalation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "m1")
        return { id: "m1", role: "marketing", active: true };
      return null;
    });
  });

  it("clears escalation fields", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      escalatedAt: new Date(),
    });
    prismaMock.vendorBrief.update.mockResolvedValue(baseBrief);

    const res = await POST_CLEAR(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/clear-escalation"),
      ctx("vb1"),
    );

    expect(res.status).toBe(200);
    const updateCall = prismaMock.vendorBrief.update.mock.calls[0][0] as {
      data: { escalatedAt: null; escalatedToUserId: null; escalationReason: null };
    };
    expect(updateCall.data.escalatedAt).toBeNull();
    expect(updateCall.data.escalatedToUserId).toBeNull();
    expect(updateCall.data.escalationReason).toBeNull();
  });

  it("400 when brief is not currently escalated", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.vendorBrief.findUnique.mockResolvedValue({
      id: "vb1",
      escalatedAt: null,
    });

    const res = await POST_CLEAR(
      createRequest("POST", "/api/marketing/vendor-briefs/vb1/clear-escalation"),
      ctx("vb1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/marketing/vendor-briefs/term-readiness/seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "m1")
        return { id: "m1", role: "marketing", active: true };
      return null;
    });
  });

  it("creates one brief per empty cell, skips cells that already have a brief", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });

    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc1", name: "Greystanes", state: "NSW" },
      { id: "svc2", name: "Beaumont Hills", state: "NSW" },
    ]);
    // svc1+flyers already exists; everything else empty.
    prismaMock.vendorBrief.findMany.mockResolvedValue([
      { serviceId: "svc1", termReadinessCategory: "flyers" },
    ]);
    prismaMock.vendorContact.findFirst.mockResolvedValue({ id: "vc-jinan" });
    prismaMock.vendorBrief.count.mockResolvedValue(0);
    prismaMock.vendorBrief.create.mockResolvedValue({ id: "new-id" });

    const res = await POST_SEED(
      createRequest("POST", "/api/marketing/vendor-briefs/term-readiness/seed", {
        body: { termYear: 2026, termNumber: 2 },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // 2 centres × 6 categories = 12 cells, 1 already exists → 11 created
    expect(body.created).toBe(11);
    expect(body.skipped).toBe(1);
    expect(prismaMock.vendorBrief.create).toHaveBeenCalledTimes(11);
  });

  it("idempotent — running twice with all cells filled creates 0", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc1", name: "Greystanes", state: "NSW" },
    ]);
    // All 6 categories already exist for svc1
    prismaMock.vendorBrief.findMany.mockResolvedValue([
      { serviceId: "svc1", termReadinessCategory: "flyers" },
      { serviceId: "svc1", termReadinessCategory: "banners" },
      { serviceId: "svc1", termReadinessCategory: "signage" },
      { serviceId: "svc1", termReadinessCategory: "holiday_programme_materials" },
      { serviceId: "svc1", termReadinessCategory: "enrolment_posters" },
      { serviceId: "svc1", termReadinessCategory: "other_print" },
    ]);
    prismaMock.vendorContact.findFirst.mockResolvedValue(null);

    const res = await POST_SEED(
      createRequest("POST", "/api/marketing/vendor-briefs/term-readiness/seed", {
        body: { termYear: 2026, termNumber: 2 },
      }),
    );

    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(6);
    expect(prismaMock.vendorBrief.create).not.toHaveBeenCalled();
  });
});
