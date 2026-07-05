import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
  ),
}));

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

import { GET, PATCH } from "@/app/api/me/briefing/route";

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
}

describe("GET /api/me/briefing", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/me/briefing"));
    expect(res.status).toBe(401);
  });

  it("returns null when no brief exists for today", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.dailyBriefing.findUnique.mockResolvedValue(null);
    const res = await GET(createRequest("GET", "/api/me/briefing"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefing).toBe(null);
  });

  it("returns today's brief scoped to the session user", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.dailyBriefing.findUnique.mockResolvedValue({
      id: "b-1",
      date: new Date("2026-07-06"),
      content: "- item",
      signals: {},
      source: "ai",
      readAt: null,
      createdAt: new Date(),
    });
    const res = await GET(createRequest("GET", "/api/me/briefing"));
    const body = await res.json();
    expect(body.briefing.id).toBe("b-1");
    const call = prismaMock.dailyBriefing.findUnique.mock.calls[0][0];
    expect(call.where.userId_date.userId).toBe("u-1");
  });
});

describe("PATCH /api/me/briefing", () => {
  beforeEach(resetCommon);

  it("marks today's unread brief as read for the session user only", async () => {
    mockSession({ id: "u-1", name: "Test", role: "member" });
    prismaMock.dailyBriefing.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(createRequest("PATCH", "/api/me/briefing"));
    expect(res.status).toBe(200);
    const call = prismaMock.dailyBriefing.updateMany.mock.calls[0][0];
    expect(call.where.userId).toBe("u-1");
    expect(call.where.readAt).toBe(null);
    expect(call.data.readAt).toBeInstanceOf(Date);
  });
});
