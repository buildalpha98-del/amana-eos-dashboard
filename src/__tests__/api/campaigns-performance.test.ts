import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// ── Standard mock preamble ──────────────────────────────────────
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

// Mock the attribution lib wholesale — the route's job is orchestration
// (load campaign → resolve window → fan out to the lib), and the lib's own
// queries are already exact-tested in campaign-attribution.test.ts.
vi.mock("@/lib/campaign-attribution", () => ({
  resolveCampaignWindow: vi.fn(),
  getCampaignSendIds: vi.fn(),
  getEmailEngagement: vi.fn(),
  getQrScans: vi.fn(),
  getAttributedEnquiries: vi.fn(),
  getEnrolmentsWon: vi.fn(),
  getOccupancyDelta: vi.fn(),
}));

import { GET } from "@/app/api/marketing/campaigns/[id]/performance/route";
import {
  resolveCampaignWindow,
  getCampaignSendIds,
  getEmailEngagement,
  getQrScans,
  getAttributedEnquiries,
  getEnrolmentsWon,
  getOccupancyDelta,
} from "@/lib/campaign-attribution";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const WINDOW = {
  start: new Date("2026-07-01T00:00:00.000Z"),
  end: new Date("2026-07-31T00:00:00.000Z"),
};

const CAMPAIGN = {
  id: "camp-1",
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-07-31T00:00:00.000Z"),
  createdAt: new Date("2026-06-15T00:00:00.000Z"),
  services: [{ serviceId: "svc-1" }, { serviceId: "svc-2" }],
};

function setupActiveUserMock(role = "owner") {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "user-1") {
        return { active: true, id: "user-1", role } as never;
      }
      return null;
    },
  );
}

function mockLibHappy() {
  vi.mocked(resolveCampaignWindow).mockReturnValue(WINDOW);
  vi.mocked(getCampaignSendIds).mockResolvedValue({
    sendIds: ["dl-1", "dl-2"],
    recipients: 40,
  });
  vi.mocked(getEmailEngagement).mockResolvedValue({
    uniqueOpens: 12,
    uniqueClicks: 5,
  });
  vi.mocked(getQrScans).mockResolvedValue({ scans: 30, uniqueScanners: 18 });
  vi.mocked(getAttributedEnquiries).mockResolvedValue({
    attributed: 4,
    contextual: 9,
  });
  vi.mocked(getEnrolmentsWon).mockResolvedValue({
    attributed: 2,
    contextual: 3,
  });
  vi.mocked(getOccupancyDelta).mockResolvedValue({
    services: [
      { serviceId: "svc-1", startPct: 71.2, endPct: 78.4 },
      { serviceId: "svc-2", startPct: null, endPct: null },
    ],
    overallStartPct: 71.2,
    overallEndPct: 78.4,
  });
}

function mockLibZero() {
  vi.mocked(resolveCampaignWindow).mockReturnValue(WINDOW);
  vi.mocked(getCampaignSendIds).mockResolvedValue({
    sendIds: [],
    recipients: 0,
  });
  vi.mocked(getEmailEngagement).mockResolvedValue({
    uniqueOpens: 0,
    uniqueClicks: 0,
  });
  vi.mocked(getQrScans).mockResolvedValue({ scans: 0, uniqueScanners: 0 });
  vi.mocked(getAttributedEnquiries).mockResolvedValue({
    attributed: 0,
    contextual: 0,
  });
  vi.mocked(getEnrolmentsWon).mockResolvedValue({
    attributed: 0,
    contextual: 0,
  });
  vi.mocked(getOccupancyDelta).mockResolvedValue({
    services: [],
    overallStartPct: null,
    overallEndPct: null,
  });
}

function getPerformance(id = "camp-1") {
  return GET(
    createRequest("GET", `/api/marketing/campaigns/${id}/performance`),
    ctx(id),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  setupActiveUserMock();
  mockSession({ id: "user-1", name: "Owner", role: "owner" });
  prismaMock.marketingCampaign.findUnique.mockResolvedValue(CAMPAIGN);
  mockLibHappy();
});

describe("GET /api/marketing/campaigns/[id]/performance — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await getPerformance();
    expect(res.status).toBe(401);
  });

  it.each(["owner", "head_office", "admin", "marketing"] as const)(
    "allows role %s",
    async (role) => {
      setupActiveUserMock(role);
      mockSession({ id: "user-1", name: "U", role });
      const res = await getPerformance();
      expect(res.status).toBe(200);
    },
  );

  it("returns 403 for member role", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });
    const res = await getPerformance();
    expect(res.status).toBe(403);
  });
});

describe("GET /api/marketing/campaigns/[id]/performance — 404", () => {
  it("returns 404 for an unknown campaign", async () => {
    prismaMock.marketingCampaign.findUnique.mockResolvedValue(null);
    const res = await getPerformance("nope");
    expect(res.status).toBe(404);
  });

  it("filters soft-deleted campaigns in the query (deleted: false in where)", async () => {
    prismaMock.marketingCampaign.findUnique.mockResolvedValue(null);
    const res = await getPerformance();
    expect(res.status).toBe(404);
    expect(prismaMock.marketingCampaign.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "camp-1", deleted: false },
      }),
    );
    // 404 means the lib is never consulted
    expect(getCampaignSendIds).not.toHaveBeenCalled();
  });
});

describe("GET /api/marketing/campaigns/[id]/performance — happy path", () => {
  it("loads the campaign with its linked service ids", async () => {
    const res = await getPerformance();
    expect(res.status).toBe(200);
    expect(prismaMock.marketingCampaign.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "camp-1", deleted: false },
        select: expect.objectContaining({
          services: { select: { serviceId: true } },
        }),
      }),
    );
  });

  it("resolves the window from the campaign dates and passes it to every lib call", async () => {
    const res = await getPerformance();
    expect(res.status).toBe(200);

    expect(resolveCampaignWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: CAMPAIGN.startDate,
        endDate: CAMPAIGN.endDate,
        createdAt: CAMPAIGN.createdAt,
      }),
    );
    expect(getCampaignSendIds).toHaveBeenCalledWith(
      expect.anything(),
      "camp-1",
    );
    expect(getEmailEngagement).toHaveBeenCalledWith(
      expect.anything(),
      ["dl-1", "dl-2"],
      WINDOW,
    );
    expect(getQrScans).toHaveBeenCalledWith(
      expect.anything(),
      "camp-1",
      WINDOW,
    );
    expect(getAttributedEnquiries).toHaveBeenCalledWith(
      expect.anything(),
      "camp-1",
      ["svc-1", "svc-2"],
      WINDOW,
    );
    expect(getEnrolmentsWon).toHaveBeenCalledWith(
      expect.anything(),
      "camp-1",
      ["svc-1", "svc-2"],
      WINDOW,
    );
    expect(getOccupancyDelta).toHaveBeenCalledWith(
      expect.anything(),
      ["svc-1", "svc-2"],
      WINDOW,
    );
  });

  it("returns the full funnel response shape", async () => {
    const res = await getPerformance();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      window: {
        start: WINDOW.start.toISOString(),
        end: WINDOW.end.toISOString(),
      },
      reach: { sends: 2, recipients: 40 },
      engagement: { uniqueOpens: 12, uniqueClicks: 5 },
      qr: { scans: 30, uniqueScanners: 18 },
      enquiries: { attributed: 4, contextual: 9 },
      enrolments: { attributed: 2, contextual: 3 },
      occupancy: {
        services: [
          { serviceId: "svc-1", startPct: 71.2, endPct: 78.4 },
          { serviceId: "svc-2", startPct: null, endPct: null },
        ],
        overallStartPct: 71.2,
        overallEndPct: 78.4,
      },
      hasData: true,
    });
  });
});

describe("GET /api/marketing/campaigns/[id]/performance — zero data", () => {
  it("returns zeros (not nulls) and hasData false for a campaign with no activity", async () => {
    mockLibZero();
    const res = await getPerformance();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.reach).toEqual({ sends: 0, recipients: 0 });
    expect(body.engagement).toEqual({ uniqueOpens: 0, uniqueClicks: 0 });
    expect(body.qr).toEqual({ scans: 0, uniqueScanners: 0 });
    expect(body.enquiries).toEqual({ attributed: 0, contextual: 0 });
    expect(body.enrolments).toEqual({ attributed: 0, contextual: 0 });
    // Occupancy nulls are legitimate "no data" (not zero occupancy)
    expect(body.occupancy).toEqual({
      services: [],
      overallStartPct: null,
      overallEndPct: null,
    });
    expect(body.hasData).toBe(false);
  });
});
