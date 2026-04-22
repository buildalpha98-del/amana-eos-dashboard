import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

const rateLimitState = { limited: false, resetIn: 0 };

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: rateLimitState.limited, resetIn: rateLimitState.resetIn })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/slack-webhook", () => ({
  sendSlackFeedback: vi.fn(() => Promise.resolve()),
}));

import { POST } from "@/app/api/internal-feedback/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { sendSlackFeedback } from "@/lib/slack-webhook";

describe("POST /api/internal-feedback", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    rateLimitState.limited = false;
    rateLimitState.resetIn = 0;
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "staff" });
  });

  it("returns 401 unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "bug", message: "x" } });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing message", async () => {
    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "bug", message: "" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid category", async () => {
    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "banana", message: "x" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/internal-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates feedback, returns 201, fires Slack webhook", async () => {
    prismaMock.internalFeedback.create.mockResolvedValue({
      id: "fb-new", category: "bug", message: "broken", status: "new",
    });

    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "bug", message: "broken" } });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(sendSlackFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "fb-new",
        authorName: "Staff",
        role: "staff",
        category: "bug",
        message: "broken",
      }),
    );
  });

  it("returns 429 when rate limited (6th req within 60s)", async () => {
    rateLimitState.limited = true;
    rateLimitState.resetIn = 30000;
    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "bug", message: "again" } });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("does not fail the response if Slack webhook throws", async () => {
    vi.mocked(sendSlackFeedback).mockRejectedValue(new Error("slack down"));
    prismaMock.internalFeedback.create.mockResolvedValue({ id: "fb-ok", category: "general", message: "m", status: "new" });

    const req = createRequest("POST", "/api/internal-feedback", { body: { category: "general", message: "m" } });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
