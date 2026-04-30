import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

const guardComplete = vi.fn(async () => {});
const guardFail = vi.fn(async () => {});
vi.mock("@/lib/cron-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-guard")>("@/lib/cron-guard");
  return {
    ...actual,
    acquireCronLock: vi.fn(async () => ({
      acquired: true,
      complete: guardComplete,
      fail: guardFail,
    })),
  };
});

import { GET } from "@/app/api/cron/draft-weekly-marketing-report/route";
import { acquireCronLock } from "@/lib/cron-guard";

function setupEmptyDatabase() {
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
  prismaMock.centreAvatar.findMany.mockResolvedValue([]);
  prismaMock.vendorBrief.count.mockResolvedValue(0);
  prismaMock.vendorBrief.findMany.mockResolvedValue([]);
  prismaMock.weeklyMarketingReport.findFirst.mockResolvedValue(null);
  prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue(null);
  prismaMock.user.findFirst.mockResolvedValue({ id: "akram-1" });
  prismaMock.weeklyMarketingReport.create.mockResolvedValue({
    id: "new-r",
    status: "draft",
    weekStart: new Date(),
  });
  // Sprint 7+8 — content team milestone resolution + team output count
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.marketingPost.count.mockResolvedValue(0);
  prismaMock.whatsAppNetworkPost.count.mockResolvedValue(0);
  prismaMock.centreAvatarInsight.count.mockResolvedValue(0);
}

function authed() {
  return createRequest("GET", "/api/cron/draft-weekly-marketing-report", {
    headers: { authorization: "Bearer test-secret" },
  });
}

describe("GET /api/cron/draft-weekly-marketing-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-04-26T09:05:00Z")); // Sunday 7:05pm AEST
    process.env.CRON_SECRET = "test-secret";
    setupEmptyDatabase();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns 401 when CRON_SECRET is missing or wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/draft-weekly-marketing-report", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("is idempotent — returns skipped message when lock not acquired", async () => {
    vi.mocked(acquireCronLock).mockResolvedValueOnce({
      acquired: false,
      reason: "already ran",
      complete: guardComplete,
      fail: guardFail,
    });
    const res = await GET(authed());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
  });

  it("creates a new draft report when none exists (happy path)", async () => {
    const res = await GET(authed());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toMatch(/drafted/i);
    expect(body.reportId).toBeDefined();
    expect(prismaMock.weeklyMarketingReport.create).toHaveBeenCalled();

    const createCall = prismaMock.weeklyMarketingReport.create.mock.calls[0][0];
    expect(createCall.data.status).toBe("draft");
    expect(typeof createCall.data.draftBody).toBe("string");
    expect(createCall.data.draftBody.length).toBeGreaterThan(0);
    expect(createCall.data.kpiSnapshot).toBeDefined();
  });

  it("updates existing draft report (overwrites snapshot) without clobbering sent reports", async () => {
    prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue({
      id: "r-existing",
      status: "draft",
      weekStart: new Date(),
      weekEnd: new Date(),
    });
    prismaMock.weeklyMarketingReport.update.mockResolvedValue({
      id: "r-existing",
      status: "draft",
    });

    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect(prismaMock.weeklyMarketingReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r-existing" },
        data: expect.objectContaining({ status: "draft" }),
      }),
    );
    expect(prismaMock.weeklyMarketingReport.create).not.toHaveBeenCalled();
  });

  it("skips overwriting when existing report is already sent", async () => {
    prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue({
      id: "r-sent",
      status: "sent",
    });

    const res = await GET(authed());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(prismaMock.weeklyMarketingReport.create).not.toHaveBeenCalled();
    expect(prismaMock.weeklyMarketingReport.update).not.toHaveBeenCalled();
  });

  it("tolerates missing data (all tables empty → still renders body)", async () => {
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const createCall = prismaMock.weeklyMarketingReport.create.mock.calls[0][0];
    expect(createCall.data.draftBody).toContain("Weekly Marketing Report");
  });
});
