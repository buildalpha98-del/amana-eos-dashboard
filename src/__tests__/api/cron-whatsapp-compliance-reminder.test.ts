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

import { GET } from "@/app/api/cron/whatsapp-compliance-reminder/route";
import { acquireCronLock } from "@/lib/cron-guard";

function authed() {
  return createRequest("GET", "/api/cron/whatsapp-compliance-reminder", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  // default: no concerns, no missing services
  prismaMock.service.findMany.mockResolvedValue([]);
  prismaMock.whatsAppCoordinatorPost.findMany.mockResolvedValue([]);
  prismaMock.aiTaskDraft.findFirst.mockResolvedValue(null);
  prismaMock.aiTaskDraft.create.mockResolvedValue({ id: "draft-1" });
  prismaMock.user.findFirst.mockResolvedValue(null);
});

afterAll(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/whatsapp-compliance-reminder", () => {
  it("401 when CRON_SECRET wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/whatsapp-compliance-reminder", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("is idempotent — returns skipped when lock not acquired", async () => {
    vi.setSystemTime(new Date("2026-04-22T22:00:00Z")); // Wed evening
    vi.mocked(acquireCronLock).mockResolvedValueOnce({
      acquired: false,
      reason: "already complete",
      complete: async () => {},
      fail: async () => {},
    });
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe(true);
  });

  it("skips on weekend defensively", async () => {
    vi.setSystemTime(new Date("2026-04-25T22:00:00Z")); // Sat
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe("weekend");
    expect(prismaMock.aiTaskDraft.create).not.toHaveBeenCalled();
  });

  it("creates one daily reminder when yesterday is incomplete (Tuesday)", async () => {
    vi.setSystemTime(new Date("2026-04-21T22:00:00Z")); // Tue
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1" },
      { id: "svc-2" },
    ]);
    // only one service has a record for yesterday (Mon)
    prismaMock.whatsAppCoordinatorPost.findMany.mockImplementation((args: any) => {
      // Cron's missing-check call uses { postedDate: yesterday }
      if (args.where?.postedDate && !args.where?.postedDate.gte) {
        return Promise.resolve([{ serviceId: "svc-1" }]);
      }
      return Promise.resolve([]);
    });

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.missingCount).toBe(1);
    expect(data.remindersCreated).toBe(1);
    expect(prismaMock.aiTaskDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "whatsapp-compliance",
          taskType: "admin",
          status: "ready",
        }),
      }),
    );
  });

  it("creates no reminder when yesterday is fully checked", async () => {
    vi.setSystemTime(new Date("2026-04-22T22:00:00Z")); // Wed
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc-1" }, { id: "svc-2" }]);
    prismaMock.whatsAppCoordinatorPost.findMany.mockImplementation((args: any) => {
      if (args.where?.postedDate && !args.where?.postedDate.gte) {
        return Promise.resolve([{ serviceId: "svc-1" }, { serviceId: "svc-2" }]);
      }
      return Promise.resolve([]);
    });
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.missingCount).toBe(0);
    expect(data.remindersCreated).toBe(0);
  });

  it("does not duplicate the daily reminder when one already exists for the date", async () => {
    vi.setSystemTime(new Date("2026-04-22T22:00:00Z"));
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc-1" }]);
    prismaMock.whatsAppCoordinatorPost.findMany.mockResolvedValue([]);
    prismaMock.aiTaskDraft.findFirst.mockResolvedValue({ id: "existing-draft" });
    const res = await GET(authed());
    const data = await res.json();
    expect(data.remindersCreated).toBe(0);
    expect(prismaMock.aiTaskDraft.create).not.toHaveBeenCalled();
  });

  it("creates a separate queue item per new two-week pattern", async () => {
    vi.setSystemTime(new Date("2026-04-22T22:00:00Z"));
    prismaMock.service.findMany.mockImplementation((args: any) => {
      if (args?.where?.status === "active" && args.select?.id && args.select?.name) {
        return Promise.resolve([{ id: "svc-1", name: "Centre A" }]);
      }
      return Promise.resolve([{ id: "svc-1" }]);
    });
    prismaMock.user.findFirst.mockResolvedValue({
      id: "coord-1",
      name: "Sara",
      email: "s@x.com",
      phone: null,
    });
    prismaMock.whatsAppCoordinatorPost.findMany.mockImplementation((args: any) => {
      if (args.where?.postedDate?.gte) {
        // both weeks: only 3 posted
        return Promise.resolve([
          { postedDate: new Date(args.where.postedDate.gte), posted: true, notPostingReason: null },
          { postedDate: new Date(args.where.postedDate.gte.getTime() + 86400000), posted: true, notPostingReason: null },
          { postedDate: new Date(args.where.postedDate.gte.getTime() + 2 * 86400000), posted: true, notPostingReason: null },
        ]);
      }
      return Promise.resolve([{ serviceId: "svc-1" }]); // yesterday is fully checked
    });
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.patternsCreated).toBe(1);
  });
});
