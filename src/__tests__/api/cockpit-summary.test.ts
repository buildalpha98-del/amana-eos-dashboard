import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));

import { GET } from "@/app/api/marketing/cockpit/summary/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function setupDefaults() {
  prismaMock.user.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.id === "marketing-1") return { active: true, id: "marketing-1", role: "marketing" };
    return null;
  });

  prismaMock.user.findFirst.mockResolvedValue({ id: "akram-1" });
  prismaMock.marketingPost.findMany.mockResolvedValue([]);
  prismaMock.user.count.mockResolvedValue(0);
  prismaMock.marketingTask.findMany.mockResolvedValue([]);
  prismaMock.aiTaskDraft.count.mockResolvedValue(0);
  prismaMock.aiTaskDraft.findMany.mockResolvedValue([]);
  prismaMock.schoolComm.findMany.mockResolvedValue([]);
  prismaMock.service.findMany.mockResolvedValue([]);
  prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([]);
  prismaMock.whatsAppCoordinatorPost.count.mockResolvedValue(0);
  prismaMock.whatsAppCoordinatorPost.findMany.mockResolvedValue([]);
  prismaMock.whatsAppNetworkPost.count.mockResolvedValue(0);
  prismaMock.centreAvatar.findMany.mockResolvedValue([]);
  prismaMock.centreAvatarInsight.count.mockResolvedValue(0);
  prismaMock.vendorBrief.count.mockResolvedValue(0);
  prismaMock.vendorBrief.findMany.mockResolvedValue([]);
  prismaMock.weeklyMarketingReport.findFirst.mockResolvedValue(null);
  prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue(null);
  prismaMock.socialCounter.findUnique.mockResolvedValue(null);
  // Sprint 7+8 — content team milestone resolution (standalone model)
  prismaMock.contentTeamMember.count.mockResolvedValue(0);
  prismaMock.contentTeamMember.findMany.mockResolvedValue([]);
  prismaMock.marketingPost.count.mockResolvedValue(0);
  prismaMock.schoolLiaisonLog.findMany.mockResolvedValue([]);
}

describe("GET /api/marketing/cockpit/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupDefaults();
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/marketing/cockpit/summary");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not marketing or owner", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "u1") return { active: true, id: "u1", role: "staff" };
      return null;
    });
    const req = createRequest("GET", "/api/marketing/cockpit/summary");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns a CockpitSummary payload for marketing user", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    const req = createRequest("GET", "/api/marketing/cockpit/summary");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      tiles: {
        brandSocial: expect.any(Object),
        contentTeam: expect.any(Object),
        schoolLiaison: expect.any(Object),
        activations: expect.any(Object),
        whatsapp: expect.any(Object),
        centreIntel: expect.any(Object),
      },
      aiDrafts: { total: 0, breakdown: expect.any(Object) },
      vendorBriefs: { inFlight: 0, slaWatch: [], missingForNextTerm: 0 },
      escalations: [],
      weeklyReport: expect.any(Object),
      priorities: [],
    });
    // Sprint 5 — WhatsApp tile thresholds and patterns
    expect(body.tiles.whatsapp.coordinator.target).toBe(50);
    expect(body.tiles.whatsapp.coordinator.floor).toBe(35);
    expect(body.tiles.whatsapp.patternsFlagged).toBe(0);
  });

  it("reads feed/story/reel counts from SocialCounter", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    prismaMock.socialCounter.findUnique.mockResolvedValue({
      id: "sc-1",
      weekStart: new Date(),
      feed: 7,
      stories: 22,
      reels: 2,
      updatedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = createRequest("GET", "/api/marketing/cockpit/summary");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tiles.brandSocial.feed.current).toBe(7);
    expect(body.tiles.brandSocial.stories.current).toBe(22);
    expect(body.tiles.brandSocial.reels.current).toBe(2);
  });
});
