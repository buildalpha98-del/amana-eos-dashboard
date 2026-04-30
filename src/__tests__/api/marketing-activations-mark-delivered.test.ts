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

import { POST } from "@/app/api/marketing/activations/[id]/mark-delivered/route";
import { GET as LIST_GET } from "@/app/api/marketing/activations/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("POST /api/marketing/activations/[id]/mark-delivered", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/marketing/activations/x/mark-delivered", { body: {} }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(res.status).toBe(401);
  });

  it("403 staff role", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await POST(
      createRequest("POST", "/api/marketing/activations/x/mark-delivered", { body: {} }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(res.status).toBe(403);
  });

  it("404 missing", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/marketing/activations/missing/mark-delivered", { body: {} }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("sets activationDeliveredAt to now and lifecycle to delivered", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "act-1",
      lifecycleStage: "final_push",
      finalPushStartedAt: new Date("2026-04-25"),
      logisticsStartedAt: new Date("2026-04-22"),
      conceptApprovedAt: new Date("2026-04-20"),
    });
    const now = new Date("2026-04-26T10:00:00Z");
    prismaMock.campaignActivationAssignment.update.mockResolvedValue({
      id: "act-1",
      activationDeliveredAt: now,
      lifecycleStage: "delivered",
    });
    const res = await POST(
      createRequest("POST", "/api/marketing/activations/act-1/mark-delivered", { body: {} }),
      { params: Promise.resolve({ id: "act-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("delivered");
    expect(data.activationDeliveredAt).toBe(now.toISOString());
    const updateArg = prismaMock.campaignActivationAssignment.update.mock.calls[0][0];
    expect(updateArg.data.lifecycleStage).toBe("delivered");
    expect(updateArg.data.activationDeliveredAt).toBeInstanceOf(Date);
  });

  it("undoes delivery when undo: true", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "act-1",
      lifecycleStage: "delivered",
      finalPushStartedAt: new Date("2026-04-25"),
      logisticsStartedAt: new Date("2026-04-22"),
      conceptApprovedAt: new Date("2026-04-20"),
    });
    prismaMock.campaignActivationAssignment.update.mockResolvedValue({
      id: "act-1",
      activationDeliveredAt: null,
      lifecycleStage: "final_push",
    });
    const res = await POST(
      createRequest("POST", "/api/marketing/activations/act-1/mark-delivered", { body: { undo: true } }),
      { params: Promise.resolve({ id: "act-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.activationDeliveredAt).toBeNull();
    expect(data.status).toBe("final_push");
  });
});

describe("GET /api/marketing/activations", () => {
  it("returns activations list and unassigned campaigns for marketing", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([
      {
        id: "act-1",
        status: "pending",
        activationDeliveredAt: null,
        budget: 200,
        campaign: { id: "c1", name: "Open Day", type: "event", startDate: null, endDate: null, status: "draft" },
        service: { id: "s1", name: "Centre A", code: "AAA" },
        recapPosts: [],
      },
    ]);
    prismaMock.marketingCampaign.findMany.mockResolvedValue([]);
    const res = await LIST_GET(createRequest("GET", "/api/marketing/activations"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.activations).toHaveLength(1);
    expect(data.activations[0].recapPostId).toBeNull();
    expect(data.unassignedCampaigns).toEqual([]);
  });

  it("surfaces relevant campaigns with no assignments under unassignedCampaigns", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([]);
    prismaMock.marketingCampaign.findMany.mockResolvedValue([
      {
        id: "c-launch",
        name: "Centre A launch",
        type: "launch",
        status: "draft",
        startDate: new Date("2026-05-15T00:00:00Z"),
        endDate: null,
        activationAssignments: [],
      },
      {
        id: "c-assigned",
        name: "Open Day",
        type: "event",
        status: "scheduled",
        startDate: null,
        endDate: null,
        activationAssignments: [{ id: "a-1" }],
      },
    ]);
    const res = await LIST_GET(createRequest("GET", "/api/marketing/activations"));
    const data = await res.json();
    expect(data.unassignedCampaigns).toHaveLength(1);
    expect(data.unassignedCampaigns[0].id).toBe("c-launch");
    expect(data.unassignedCampaigns[0].name).toBe("Centre A launch");
    // Filter passed to prisma should restrict types
    const findArgs = prismaMock.marketingCampaign.findMany.mock.calls[0][0];
    expect(findArgs.where.type.in).toEqual(["event", "launch", "activation"]);
  });

  it("403 for non-marketing role", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await LIST_GET(createRequest("GET", "/api/marketing/activations"));
    expect(res.status).toBe(403);
  });
});
