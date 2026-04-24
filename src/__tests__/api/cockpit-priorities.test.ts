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

import { POST } from "@/app/api/marketing/cockpit/priorities/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function setupActiveUser() {
  prismaMock.user.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.id === "marketing-1") return { active: true, id: "marketing-1", role: "marketing" };
    return null;
  });
}

describe("POST /api/marketing/cockpit/priorities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUser();
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/marketing/cockpit/priorities", {
      body: { nextWeekTop3: "1. test" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when nextWeekTop3 is not provided", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    const req = createRequest("POST", "/api/marketing/cockpit/priorities", {
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates a draft report when none exists for the week", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue(null);
    prismaMock.weeklyMarketingReport.create.mockResolvedValue({
      id: "new-r",
      status: "draft",
      nextWeekTop3: "1. Top thing",
    });

    const req = createRequest("POST", "/api/marketing/cockpit/priorities", {
      body: { nextWeekTop3: "1. Top thing" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.weeklyMarketingReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextWeekTop3: "1. Top thing",
          status: "draft",
        }),
      }),
    );
  });

  it("updates existing draft report", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue({
      id: "r1",
      status: "draft",
    });
    prismaMock.weeklyMarketingReport.update.mockResolvedValue({
      id: "r1",
      status: "draft",
      nextWeekTop3: "updated",
    });

    const req = createRequest("POST", "/api/marketing/cockpit/priorities", {
      body: { nextWeekTop3: "updated" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.weeklyMarketingReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: { nextWeekTop3: "updated" },
      }),
    );
  });

  it("rejects with 409 when report already sent", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue({
      id: "r1",
      status: "sent",
    });

    const req = createRequest("POST", "/api/marketing/cockpit/priorities", {
      body: { nextWeekTop3: "late update" },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});
