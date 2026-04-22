import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 4, resetIn: 60000 }),
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

vi.mock("@/lib/ai", () => ({
  getAI: vi.fn(() => ({})),
  generateText: vi.fn(async () =>
    JSON.stringify({
      score: 78,
      summary: "Strong early-childhood experience. Cert III. No gaps flagged.",
    }),
  ),
}));

import { POST } from "@/app/api/recruitment/candidates/[id]/ai-screen/route";
import { checkRateLimit } from "@/lib/rate-limit";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("POST /api/recruitment/candidates/[id]/ai-screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest(
      "POST",
      "/api/recruitment/candidates/c-1/ai-screen",
    );
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(401);
  });

  it("403 for non-admin role", async () => {
    mockSession({ id: "u-1", name: "Test", role: "member" });
    const req = createRequest(
      "POST",
      "/api/recruitment/candidates/c-1/ai-screen",
    );
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(403);
  });

  it("404 when candidate not found", async () => {
    mockSession({ id: "u-1", name: "Test", role: "admin" });
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue(null);
    const req = createRequest(
      "POST",
      "/api/recruitment/candidates/c-missing/ai-screen",
    );
    const res = await POST(req, {
      params: Promise.resolve({ id: "c-missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("400 when candidate has no resumeText", async () => {
    mockSession({ id: "u-1", name: "Test", role: "admin" });
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue({
      id: "c-1",
      name: "X",
      email: null,
      phone: null,
      resumeText: null,
      vacancy: {
        role: "educator",
        employmentType: "permanent",
        qualificationRequired: null,
      },
    });
    const req = createRequest(
      "POST",
      "/api/recruitment/candidates/c-1/ai-screen",
    );
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(400);
  });

  it("200 persists score + summary", async () => {
    mockSession({ id: "u-1", name: "Test", role: "admin" });
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue({
      id: "c-1",
      name: "Amira Candidate",
      email: "amira@test.com",
      phone: null,
      resumeText: "3 years OSHC, Cert III",
      vacancy: {
        role: "educator",
        employmentType: "part_time",
        qualificationRequired: "cert_iii",
      },
    });
    prismaMock.recruitmentCandidate.update.mockResolvedValue({
      id: "c-1",
      aiScreenScore: 78,
      aiScreenSummary:
        "Strong early-childhood experience. Cert III. No gaps flagged.",
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest(
      "POST",
      "/api/recruitment/candidates/c-1/ai-screen",
    );
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiScreenScore).toBe(78);
    expect(body.aiScreenSummary).toContain("Strong");
    expect(prismaMock.recruitmentCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c-1" },
        data: expect.objectContaining({ aiScreenScore: 78 }),
      }),
    );
  });

  it("429 when rate-limit exceeded on rapid-fire consecutive requests (5/min cap)", async () => {
    mockSession({ id: "u-1", name: "Test", role: "admin" });
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue({
      id: "c-1",
      name: "X",
      email: null,
      phone: null,
      resumeText: "ok",
      vacancy: {
        role: "educator",
        employmentType: "permanent",
        qualificationRequired: null,
      },
    });
    prismaMock.recruitmentCandidate.update.mockResolvedValue({
      id: "c-1",
      aiScreenScore: 78,
      aiScreenSummary: "...",
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const limited = vi.mocked(checkRateLimit);
    limited
      .mockResolvedValueOnce({ limited: false, remaining: 4, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: false, remaining: 3, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: false, remaining: 2, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: false, remaining: 1, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: false, remaining: 0, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: true, remaining: 0, resetIn: 60000 });

    let last: Response | null = null;
    for (let i = 0; i < 6; i++) {
      const req = createRequest(
        "POST",
        "/api/recruitment/candidates/c-1/ai-screen",
      );
      last = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    }
    expect(last?.status).toBe(429);
  });
});
