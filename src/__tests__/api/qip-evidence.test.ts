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
import { GET } from "@/app/api/services/[id]/qip-evidence/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}

const reflectionRow = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  title: "Daily reflection",
  content: "We practised turn-taking at the cubby. ".repeat(20),
  qualityAreas: [5],
  mtopOutcomes: ["Wellbeing"],
  aiTagged: false,
  createdAt: new Date("2026-07-01T05:00:00Z"),
  author: { id: "u1", name: "Edu", avatar: null },
  ...over,
});

const observationRow = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  title: "Cubby play",
  narrative: "Aisha led the cubby construction.",
  mtopOutcomes: ["Learners"],
  aiTagged: true,
  childId: "c1",
  createdAt: new Date("2026-07-02T05:00:00Z"),
  author: { id: "u1", name: "Edu", avatar: null },
  ...over,
});

describe("GET /api/services/[id]/qip-evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.staffReflection.findMany.mockResolvedValue([]);
    prismaMock.learningObservation.findMany.mockResolvedValue([]);
  });

  it("401 without session", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/services/s1/qip-evidence"),
      await ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("403 for cross-service member", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "other" });
    const res = await GET(
      createRequest("GET", "/api/services/s1/qip-evidence"),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("merges reflections + observations sorted desc by createdAt", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.staffReflection.findMany.mockResolvedValue([reflectionRow()]);
    prismaMock.learningObservation.findMany.mockResolvedValue([observationRow()]);

    const res = await GET(
      createRequest("GET", "/api/services/s1/qip-evidence"),
      await ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].kind).toBe("observation"); // Jul 2 before Jul 1
    expect(body.items[1].kind).toBe("reflection");
    expect(body.items[1].excerpt.length).toBeLessThanOrEqual(300);
  });

  it("qa filter without mtop returns reflections only", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.staffReflection.findMany.mockResolvedValue([reflectionRow()]);

    const res = await GET(
      createRequest("GET", "/api/services/s1/qip-evidence?qa=5"),
      await ctx(),
    );
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].kind).toBe("reflection");
    expect(prismaMock.staffReflection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ qualityAreas: { has: 5 } }),
      }),
    );
    expect(prismaMock.learningObservation.findMany).not.toHaveBeenCalled();
  });

  it("mtop filter queries both tables with the outcome", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    const res = await GET(
      createRequest("GET", "/api/services/s1/qip-evidence?mtop=Wellbeing"),
      await ctx(),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.staffReflection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ mtopOutcomes: { has: "Wellbeing" } }),
      }),
    );
    expect(prismaMock.learningObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ mtopOutcomes: { has: "Wellbeing" } }),
      }),
    );
  });

  it("applies from/to date range", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    await GET(
      createRequest(
        "GET",
        "/api/services/s1/qip-evidence?from=2026-06-01&to=2026-07-01",
      ),
      await ctx(),
    );
    expect(prismaMock.staffReflection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2026-06-01"),
            lte: new Date("2026-07-01"),
          },
        }),
      }),
    );
  });

  it("400 on invalid qa / mtop values", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    const bad1 = await GET(
      createRequest("GET", "/api/services/s1/qip-evidence?qa=9"),
      await ctx(),
    );
    expect(bad1.status).toBe(400);
    const bad2 = await GET(
      createRequest("GET", "/api/services/s1/qip-evidence?mtop=Bogus"),
      await ctx(),
    );
    expect(bad2.status).toBe(400);
  });
});
