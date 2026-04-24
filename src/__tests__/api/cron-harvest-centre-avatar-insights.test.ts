import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
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

import { POST } from "@/app/api/cron/harvest-centre-avatar-insights/route";

function authed() {
  return createRequest("POST", "/api/cron/harvest-centre-avatar-insights", {
    headers: { authorization: "Bearer test-secret" },
  });
}

describe("POST /api/cron/harvest-centre-avatar-insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";

    prismaMock.centreAvatar.findMany.mockResolvedValue([
      { id: "ca1", serviceId: "svc1", service: { code: "GRE" } },
    ]);
    prismaMock.npsSurveyResponse.findMany.mockResolvedValue([]);
    prismaMock.quickFeedback.findMany.mockResolvedValue([]);
    prismaMock.parentFeedback.findMany.mockResolvedValue([]);
  });

  it("returns 401 without the secret", async () => {
    const res = await POST(
      createRequest("POST", "/api/cron/harvest-centre-avatar-insights", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("harvests NPS detractors into complaint insights", async () => {
    prismaMock.npsSurveyResponse.findMany.mockResolvedValue([
      {
        id: "nps1",
        serviceId: "svc1",
        score: 2,
        category: "detractor",
        comment: "Too crowded and stressful pickup",
        respondedAt: new Date("2026-04-24T08:00:00Z"),
      },
    ]);
    prismaMock.centreAvatarInsight.create.mockResolvedValue({});

    const res = await POST(authed());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.npsHarvested).toBe(1);
    expect(prismaMock.centreAvatarInsight.create).toHaveBeenCalledTimes(1);
    const call = prismaMock.centreAvatarInsight.create.mock.calls[0][0] as {
      data: { source: string; insight: string; harvestedFrom: string; sourceRecordId: string };
    };
    expect(call.data.source).toBe("complaint");
    expect(call.data.insight).toContain("NPS 2/10");
    expect(call.data.harvestedFrom).toBe("nps_survey_response");
    expect(call.data.sourceRecordId).toBe("nps1");
  });

  it("harvests quick feedback scored 5 as compliments", async () => {
    prismaMock.quickFeedback.findMany.mockResolvedValue([
      {
        id: "qf1",
        serviceId: "svc1",
        score: 5,
        comment: "Educators are amazing",
        createdAt: new Date("2026-04-24T08:00:00Z"),
      },
    ]);
    prismaMock.centreAvatarInsight.create.mockResolvedValue({});

    const res = await POST(authed());
    const body = await res.json();

    expect(body.quickHarvested).toBe(1);
    const call = prismaMock.centreAvatarInsight.create.mock.calls[0][0] as {
      data: { source: string; insight: string };
    };
    expect(call.data.source).toBe("compliment");
    expect(call.data.insight).toContain("Quick feedback 5/5");
  });

  it("skips rows without content", async () => {
    prismaMock.quickFeedback.findMany.mockResolvedValue([
      {
        id: "qf-empty",
        serviceId: "svc1",
        score: 4,
        comment: "   ",
        createdAt: new Date(),
      },
    ]);

    const res = await POST(authed());
    const body = await res.json();

    expect(body.quickHarvested).toBe(0);
    expect(body.skippedNoContent).toBe(1);
    expect(prismaMock.centreAvatarInsight.create).not.toHaveBeenCalled();
  });

  it("skips rows when no Avatar exists for the service", async () => {
    prismaMock.npsSurveyResponse.findMany.mockResolvedValue([
      {
        id: "nps-orphan",
        serviceId: "unknown-service",
        score: 10,
        category: "promoter",
        comment: "Perfect",
        respondedAt: new Date(),
      },
    ]);

    const res = await POST(authed());
    const body = await res.json();

    expect(body.npsHarvested).toBe(0);
    expect(body.skippedNoAvatar).toBe(1);
    expect(prismaMock.centreAvatarInsight.create).not.toHaveBeenCalled();
  });

  it("is idempotent when the unique constraint rejects duplicates (P2002)", async () => {
    prismaMock.quickFeedback.findMany.mockResolvedValue([
      {
        id: "qf-dup",
        serviceId: "svc1",
        score: 3,
        comment: "ok",
        createdAt: new Date(),
      },
    ]);
    prismaMock.centreAvatarInsight.create.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );

    const res = await POST(authed());
    const body = await res.json();

    // create was attempted but the duplicate was swallowed
    expect(prismaMock.centreAvatarInsight.create).toHaveBeenCalledTimes(1);
    expect(body.quickHarvested).toBe(0);
  });

  it("resolves ParentFeedback by serviceId when present, falls back to serviceCode", async () => {
    prismaMock.parentFeedback.findMany.mockResolvedValue([
      {
        id: "pf1",
        serviceId: null,
        serviceCode: "GRE",
        surveyType: "compliment",
        sentiment: "positive",
        comments: "Love the activities",
        submittedAt: new Date("2026-04-24T08:00:00Z"),
      },
    ]);
    prismaMock.centreAvatarInsight.create.mockResolvedValue({});

    const res = await POST(authed());
    const body = await res.json();

    expect(body.parentHarvested).toBe(1);
    const call = prismaMock.centreAvatarInsight.create.mock.calls[0][0] as {
      data: { source: string; centreAvatarId: string };
    };
    expect(call.data.centreAvatarId).toBe("ca1");
    expect(call.data.source).toBe("compliment");
  });
});
