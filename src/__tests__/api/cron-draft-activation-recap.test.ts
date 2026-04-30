import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
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

import { GET } from "@/app/api/cron/draft-activation-recap/route";
import { acquireCronLock } from "@/lib/cron-guard";

function authed() {
  return createRequest("GET", "/api/cron/draft-activation-recap", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  vi.setSystemTime(new Date("2026-04-26T07:00:00Z"));

  prismaMock.user.findFirst.mockResolvedValue({ id: "akram-1" });
  prismaMock.aiTaskDraft.findFirst.mockResolvedValue(null);
  prismaMock.aiTaskDraft.create.mockResolvedValue({ id: "draft-1" });
  prismaMock.marketingPost.create.mockResolvedValue({ id: "post-1" });
});

afterAll(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/draft-activation-recap", () => {
  it("401 when CRON_SECRET wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/draft-activation-recap", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("idempotent — skipped when guard not acquired", async () => {
    vi.mocked(acquireCronLock).mockResolvedValueOnce({
      acquired: false,
      reason: "already complete",
      complete: async () => {},
      fail: async () => {},
    });
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([]);
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
  });

  it("creates a MarketingPost + AiTaskDraft for an eligible activation", async () => {
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([
      {
        id: "act-1",
        activationDeliveredAt: new Date("2026-04-23T10:00:00Z"),
        campaign: { id: "camp-1", name: "Open Day", type: "event" },
        service: { id: "svc-1", name: "Centre A", code: "AAA", state: "NSW" },
        recapPosts: [],
      },
    ]);
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.created).toHaveLength(1);
    expect(prismaMock.marketingPost.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiTaskDraft.create).toHaveBeenCalledTimes(1);

    const postArg = prismaMock.marketingPost.create.mock.calls[0][0];
    expect(postArg.data.recapForActivationId).toBe("act-1");
    expect(postArg.data.platform).toBe("instagram");
    expect(postArg.data.status).toBe("draft");
    expect(postArg.data.content).toContain("Recap: Open Day at Centre A");

    const draftArg = prismaMock.aiTaskDraft.create.mock.calls[0][0];
    expect(draftArg.data.source).toBe("activation-recap");
    expect(draftArg.data.targetId).toBe("act-1");
  });

  it("skips activations with an existing recap post", async () => {
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([
      {
        id: "act-1",
        activationDeliveredAt: new Date("2026-04-23T10:00:00Z"),
        campaign: { id: "camp-1", name: "Open Day", type: "event" },
        service: { id: "svc-1", name: "Centre A", code: "AAA", state: "NSW" },
        recapPosts: [{ id: "p-existing" }],
      },
    ]);
    const res = await GET(authed());
    const data = await res.json();
    expect(data.created).toHaveLength(0);
    expect(data.skipped[0].reason).toBe("recap_post_exists");
    expect(prismaMock.marketingPost.create).not.toHaveBeenCalled();
  });

  it("skips activations with an existing AiTaskDraft (Akram dismissed it)", async () => {
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([
      {
        id: "act-1",
        activationDeliveredAt: new Date("2026-04-23T10:00:00Z"),
        campaign: { id: "camp-1", name: "Open Day", type: "event" },
        service: { id: "svc-1", name: "Centre A", code: "AAA", state: "NSW" },
        recapPosts: [],
      },
    ]);
    prismaMock.aiTaskDraft.findFirst.mockResolvedValue({ id: "dismissed" });
    const res = await GET(authed());
    const data = await res.json();
    expect(data.created).toHaveLength(0);
    expect(data.skipped[0].reason).toBe("draft_exists_or_dismissed");
    expect(prismaMock.marketingPost.create).not.toHaveBeenCalled();
  });

  it("does not include activations delivered <48h ago (filtered by query)", async () => {
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([]);
    const res = await GET(authed());
    const data = await res.json();
    expect(data.created).toHaveLength(0);
    const findArg = prismaMock.campaignActivationAssignment.findMany.mock.calls[0][0];
    expect(findArg.where.activationDeliveredAt.not).toBeNull();
    expect(findArg.where.activationDeliveredAt.lte).toBeInstanceOf(Date);
  });

  it("creates one draft per eligible activation when multiple delivered same day", async () => {
    prismaMock.campaignActivationAssignment.findMany.mockResolvedValue([
      {
        id: "act-1",
        activationDeliveredAt: new Date("2026-04-23T10:00:00Z"),
        campaign: { id: "camp-1", name: "Open Day", type: "event" },
        service: { id: "svc-1", name: "Centre A", code: "AAA", state: "NSW" },
        recapPosts: [],
      },
      {
        id: "act-2",
        activationDeliveredAt: new Date("2026-04-23T11:00:00Z"),
        campaign: { id: "camp-2", name: "STEM Night", type: "event" },
        service: { id: "svc-2", name: "Centre B", code: "BBB", state: "VIC" },
        recapPosts: [],
      },
    ]);
    prismaMock.marketingPost.create
      .mockResolvedValueOnce({ id: "post-1" })
      .mockResolvedValueOnce({ id: "post-2" });
    prismaMock.aiTaskDraft.create
      .mockResolvedValueOnce({ id: "draft-1" })
      .mockResolvedValueOnce({ id: "draft-2" });
    const res = await GET(authed());
    const data = await res.json();
    expect(data.created).toHaveLength(2);
    expect(prismaMock.marketingPost.create).toHaveBeenCalledTimes(2);
  });
});
