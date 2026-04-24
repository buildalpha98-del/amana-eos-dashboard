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
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() => Promise.resolve({ success: true })),
  FROM_EMAIL: "test@amanaoshc.com.au",
}));

import { POST } from "@/app/api/marketing/cockpit/weekly-report/[id]/send/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { sendEmail } from "@/lib/email";

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

function setupActiveUser() {
  prismaMock.user.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.id === "marketing-1") return { active: true, id: "marketing-1", role: "marketing" };
    if (args?.where?.id === "owner-1") return { active: true, id: "owner-1", role: "owner" };
    return null;
  });
}

describe("POST /api/marketing/cockpit/weekly-report/[id]/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUser();
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/marketing/cockpit/weekly-report/r1/send");
    const res = await POST(req, ctx({ id: "r1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when report not found", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue(null);
    const req = createRequest("POST", "/api/marketing/cockpit/weekly-report/r1/send");
    const res = await POST(req, ctx({ id: "r1" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when report already sent", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue({
      id: "r1",
      status: "sent",
      weekStart: new Date("2026-04-20"),
      weekEnd: new Date("2026-04-26"),
      wins: null,
      blockers: null,
      nextWeekTop3: null,
      draftBody: "",
    });
    const req = createRequest("POST", "/api/marketing/cockpit/weekly-report/r1/send");
    const res = await POST(req, ctx({ id: "r1" }));
    expect(res.status).toBe(409);
  });

  it("returns 409 when no active owner exists", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue({
      id: "r1",
      status: "reviewed",
      weekStart: new Date("2026-04-20"),
      weekEnd: new Date("2026-04-26"),
      wins: "big win",
      blockers: null,
      nextWeekTop3: null,
      draftBody: "# Report",
    });
    prismaMock.user.findFirst.mockResolvedValue(null);
    const req = createRequest("POST", "/api/marketing/cockpit/weekly-report/r1/send");
    const res = await POST(req, ctx({ id: "r1" }));
    expect(res.status).toBe(409);
  });

  it("sends email and updates status to sent (happy path)", async () => {
    mockSession({ id: "marketing-1", name: "Akram", role: "marketing" });
    prismaMock.weeklyMarketingReport.findUnique.mockResolvedValue({
      id: "r1",
      status: "reviewed",
      weekStart: new Date("2026-04-20"),
      weekEnd: new Date("2026-04-26"),
      wins: "Launched campaign",
      blockers: null,
      nextWeekTop3: "1. Ship cockpit",
      draftBody: "# Report body",
    });
    prismaMock.user.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.role === "owner") return { id: "owner-1", name: "Jayden", email: "jayden@a.com" };
      if (args?.where?.role === "marketing") return { id: "marketing-1", name: "Akram", email: "akram@a.com" };
      return null;
    });
    prismaMock.weeklyMarketingReport.update.mockResolvedValue({
      id: "r1",
      status: "sent",
    });

    const req = createRequest("POST", "/api/marketing/cockpit/weekly-report/r1/send");
    const res = await POST(req, ctx({ id: "r1" }));

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jayden@a.com",
        replyTo: "akram@a.com",
      }),
    );
    expect(prismaMock.weeklyMarketingReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ status: "sent", sentById: "marketing-1" }),
      }),
    );
  });
});
