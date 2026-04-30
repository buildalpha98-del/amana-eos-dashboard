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

import { GET as LIST_GET, POST as CREATE_POST } from "@/app/api/marketing/activations/route";
import { PATCH as PATCH_ROUTE } from "@/app/api/marketing/activations/[id]/route";
import { POST as TRANSITION_POST } from "@/app/api/marketing/activations/[id]/transition/route";
import { GET as GRID_GET } from "@/app/api/marketing/activations/term-grid/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("GET /api/marketing/activations", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await LIST_GET(createRequest("GET", "/api/marketing/activations"));
    expect(res.status).toBe(401);
  });

  it("403 staff role", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await LIST_GET(createRequest("GET", "/api/marketing/activations"));
    expect(res.status).toBe(403);
  });

  it("returns serialised activations + unassigned campaigns", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([
      {
        id: "a-1",
        activationType: "open_day",
        lifecycleStage: "logistics",
        scheduledFor: new Date("2026-05-15T10:00:00Z"),
        expectedAttendance: 30,
        actualAttendance: null,
        enquiriesGenerated: null,
        budget: 200,
        notes: null,
        termYear: 2026,
        termNumber: 2,
        conceptApprovedAt: new Date("2026-04-20T00:00:00Z"),
        logisticsStartedAt: new Date("2026-04-25T00:00:00Z"),
        finalPushStartedAt: null,
        activationDeliveredAt: null,
        recapPublishedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        campaign: { id: "c-1", name: "Open Day", type: "event", status: "scheduled", startDate: null, endDate: null },
        service: { id: "s-1", name: "Centre A", code: "AAA", state: "NSW" },
        coordinator: null,
        recapPosts: [],
      },
    ]);
    prismaMock.marketingCampaign.findMany.mockResolvedValue([
      {
        id: "c-2",
        name: "Term 3 launch",
        type: "launch",
        status: "draft",
        startDate: null,
        endDate: null,
        activationAssignments: [],
      },
    ]);
    const res = await LIST_GET(createRequest("GET", "/api/marketing/activations?view=in_flight"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.activations).toHaveLength(1);
    expect(data.activations[0].lifecycleStage).toBe("logistics");
    expect(data.activations[0].timestamps.logisticsStartedAt).toBeTruthy();
    expect(data.activations[0].recapStatus).toBe("not_due");
    expect(data.unassignedCampaigns).toHaveLength(1);
    expect(data.unassignedCampaigns[0].id).toBe("c-2");
  });

  it("400 on invalid query (bad termNumber)", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await LIST_GET(createRequest("GET", "/api/marketing/activations?termNumber=9"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/marketing/activations", () => {
  it("creates with concept stage and derived term", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.marketingCampaign.findUnique.mockResolvedValue({ id: "c-1", startDate: null });
    prismaMock.service.findUnique.mockResolvedValue({ id: "s-1" });
    prismaMock.campaignActivationAssignment.create.mockResolvedValue({
      id: "a-new",
      activationType: "open_day",
      lifecycleStage: "concept",
      scheduledFor: new Date("2026-05-15T00:00:00Z"),
      expectedAttendance: 30,
      actualAttendance: null,
      enquiriesGenerated: null,
      budget: null,
      notes: null,
      termYear: 2026,
      termNumber: 2,
      conceptApprovedAt: null,
      logisticsStartedAt: null,
      finalPushStartedAt: null,
      activationDeliveredAt: null,
      recapPublishedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      campaign: { id: "c-1", name: "Open Day", type: "event", status: "draft", startDate: null, endDate: null },
      service: { id: "s-1", name: "Centre A", code: "AAA", state: "NSW" },
      coordinator: null,
      recapPosts: [],
    });
    const res = await CREATE_POST(
      createRequest("POST", "/api/marketing/activations", {
        body: { campaignId: "c-1", serviceId: "s-1", activationType: "open_day", scheduledFor: "2026-05-15T00:00:00Z", expectedAttendance: 30 },
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.lifecycleStage).toBe("concept");
    const createArg = prismaMock.campaignActivationAssignment.create.mock.calls[0][0];
    expect(createArg.data.termYear).toBe(2026);
    expect(createArg.data.termNumber).toBe(2);
  });

  it("400 on unknown campaign", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.marketingCampaign.findUnique.mockResolvedValue(null);
    prismaMock.service.findUnique.mockResolvedValue({ id: "s-1" });
    const res = await CREATE_POST(
      createRequest("POST", "/api/marketing/activations", {
        body: { campaignId: "nope", serviceId: "s-1" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("409 on duplicate (P2002)", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.marketingCampaign.findUnique.mockResolvedValue({ id: "c-1", startDate: null });
    prismaMock.service.findUnique.mockResolvedValue({ id: "s-1" });
    prismaMock.campaignActivationAssignment.create.mockRejectedValue({ code: "P2002" });
    const res = await CREATE_POST(
      createRequest("POST", "/api/marketing/activations", {
        body: { campaignId: "c-1", serviceId: "s-1" },
      }),
    );
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/marketing/activations/[id]", () => {
  it("updates simple fields", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({ id: "a-1" });
    prismaMock.campaignActivationAssignment.update.mockResolvedValue({
      id: "a-1",
      lifecycleStage: "concept",
      scheduledFor: new Date("2026-05-15T10:00:00Z"),
      termYear: 2026,
      termNumber: 2,
    });
    const res = await PATCH_ROUTE(
      createRequest("PATCH", "/api/marketing/activations/a-1", {
        body: { scheduledFor: "2026-05-15T10:00:00Z", expectedAttendance: 50 },
      }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.campaignActivationAssignment.update.mock.calls[0][0];
    expect(updateArgs.data.termYear).toBe(2026);
    expect(updateArgs.data.termNumber).toBe(2);
  });

  it("404 missing", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue(null);
    const res = await PATCH_ROUTE(
      createRequest("PATCH", "/api/marketing/activations/missing", { body: {} }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/marketing/activations/[id]/transition", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await TRANSITION_POST(
      createRequest("POST", "/api/marketing/activations/a-1/transition", { body: { toStage: "approved" } }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("400 backwards transition", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      lifecycleStage: "approved",
      notes: null,
    });
    const res = await TRANSITION_POST(
      createRequest("POST", "/api/marketing/activations/a-1/transition", { body: { toStage: "concept" } }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("400 marking delivered without attendance", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      lifecycleStage: "final_push",
      notes: null,
    });
    const res = await TRANSITION_POST(
      createRequest("POST", "/api/marketing/activations/a-1/transition", { body: { toStage: "delivered" } }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("happy path: concept → approved", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      lifecycleStage: "concept",
      notes: null,
    });
    prismaMock.campaignActivationAssignment.update.mockResolvedValue({
      id: "a-1",
      lifecycleStage: "approved",
      conceptApprovedAt: new Date("2026-04-28T10:00:00Z"),
      logisticsStartedAt: null,
      finalPushStartedAt: null,
      activationDeliveredAt: null,
      recapPublishedAt: null,
      cancelledAt: null,
      actualAttendance: null,
      enquiriesGenerated: null,
      cancellationReason: null,
    });
    const res = await TRANSITION_POST(
      createRequest("POST", "/api/marketing/activations/a-1/transition", {
        body: { toStage: "approved", occurredAt: "2026-04-28T10:00:00Z" },
      }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.lifecycleStage).toBe("approved");
    expect(data.timestamps.conceptApprovedAt).toBe("2026-04-28T10:00:00.000Z");
  });

  it("delivered → recap_published links the post", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      lifecycleStage: "delivered",
      notes: null,
    });
    prismaMock.marketingPost.findUnique.mockResolvedValue({ id: "post-1" });
    prismaMock.marketingPost.update.mockResolvedValue({ id: "post-1" });
    prismaMock.campaignActivationAssignment.update.mockResolvedValue({
      id: "a-1",
      lifecycleStage: "recap_published",
      conceptApprovedAt: null,
      logisticsStartedAt: null,
      finalPushStartedAt: null,
      activationDeliveredAt: null,
      recapPublishedAt: new Date("2026-04-28T10:00:00Z"),
      cancelledAt: null,
      actualAttendance: null,
      enquiriesGenerated: null,
      cancellationReason: null,
    });
    const res = await TRANSITION_POST(
      createRequest("POST", "/api/marketing/activations/a-1/transition", {
        body: { toStage: "recap_published", recapPostId: "post-1" },
      }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(200);
    expect(prismaMock.marketingPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "post-1" }, data: { recapForActivationId: "a-1" } }),
    );
  });

  it("cancellation persists reason", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      lifecycleStage: "logistics",
      notes: null,
    });
    prismaMock.campaignActivationAssignment.update.mockResolvedValue({
      id: "a-1",
      lifecycleStage: "cancelled",
      conceptApprovedAt: null,
      logisticsStartedAt: null,
      finalPushStartedAt: null,
      activationDeliveredAt: null,
      recapPublishedAt: null,
      cancelledAt: new Date(),
      actualAttendance: null,
      enquiriesGenerated: null,
      cancellationReason: "venue fell through",
    });
    const res = await TRANSITION_POST(
      createRequest("POST", "/api/marketing/activations/a-1/transition", {
        body: { toStage: "cancelled", cancellationReason: "venue fell through" },
      }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.lifecycleStage).toBe("cancelled");
    expect(data.cancellationReason).toBe("venue fell through");
  });
});

describe("GET /api/marketing/activations/term-grid", () => {
  it("returns 10 rows for a term", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `s-${i}`,
        name: `Centre ${i}`,
        state: i % 2 === 0 ? "NSW" : "VIC",
        code: `C${i}`,
      })),
    );
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([
      {
        id: "a-1",
        serviceId: "s-0",
        lifecycleStage: "delivered",
        scheduledFor: null,
        activationType: "open_day",
        activationDeliveredAt: new Date(),
        recapPublishedAt: null,
        actualAttendance: 25,
        expectedAttendance: 30,
        campaign: { id: "c-1", name: "Open Day", type: "event" },
      },
      {
        id: "a-2",
        serviceId: "s-0",
        lifecycleStage: "logistics",
        scheduledFor: null,
        activationType: "expert_talk",
        activationDeliveredAt: null,
        recapPublishedAt: null,
        actualAttendance: null,
        expectedAttendance: 20,
        campaign: { id: "c-2", name: "Expert Talk", type: "event" },
      },
    ]);
    const res = await GRID_GET(createRequest("GET", "/api/marketing/activations/term-grid?termYear=2026&termNumber=2"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.matrix).toHaveLength(10);
    expect(data.matrix[0].counts.delivered).toBe(1);
    expect(data.matrix[0].counts.planned).toBe(1);
    expect(data.matrix[0].status).toBe("green"); // 1 delivered + 1 planned = total 2
    expect(data.termTotals.delivered).toBe(1);
  });
});
