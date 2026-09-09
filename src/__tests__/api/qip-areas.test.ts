import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
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

import { _clearUserActiveCache } from "@/lib/server-auth";
import { PATCH } from "@/app/api/qip/[id]/areas/[areaId]/route";

async function ctx(id = "q1", areaId = "qa1") {
  return { params: Promise.resolve({ id, areaId }) };
}

describe("PATCH /api/qip/[id]/areas/[areaId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.qIPQualityArea.update.mockResolvedValue({ id: "qa1" });
  });

  it("401 without session", async () => {
    mockNoSession();
    const res = await PATCH(
      createRequest("PATCH", "/api/qip/q1/areas/qa1", {
        body: { strengths: "x" },
      }),
      await ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("persists the real schema fields", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
    const res = await PATCH(
      createRequest("PATCH", "/api/qip/q1/areas/qa1", {
        body: {
          improvementGoal: "Embed restorative practice",
          progressStatus: "in_progress",
          strengths: "Strong educator-child relationships",
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.qIPQualityArea.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "qa1" },
        data: {
          improvementGoal: "Embed restorative practice",
          progressStatus: "in_progress",
          strengths: "Strong educator-child relationships",
        },
      }),
    );
  });

  it("400 on unknown fields instead of silently stripping them", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
    // `rating` and `goals` were phantom fields the old UI submitted; strip
    // mode swallowed them and the edit silently vanished. Strict mode makes
    // that drift loud.
    const res = await PATCH(
      createRequest("PATCH", "/api/qip/q1/areas/qa1", {
        body: { rating: "meeting", goals: "some goals" },
      }),
      await ctx(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.qIPQualityArea.update).not.toHaveBeenCalled();
  });

  it("400 on invalid progressStatus enum value", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
    const res = await PATCH(
      createRequest("PATCH", "/api/qip/q1/areas/qa1", {
        body: { progressStatus: "excellent" },
      }),
      await ctx(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.qIPQualityArea.update).not.toHaveBeenCalled();
  });
});
