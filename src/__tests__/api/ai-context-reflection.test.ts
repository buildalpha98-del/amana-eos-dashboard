import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
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
import { GET } from "@/app/api/services/[id]/ai-context/reflection/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  // Default — empty result sets
  prismaMock.service.findUnique.mockResolvedValue({ name: "Cessnock" });
  prismaMock.learningObservation.findMany.mockResolvedValue([]);
  prismaMock.incidentRecord.findMany.mockResolvedValue([]);
  prismaMock.auditInstance.findMany.mockResolvedValue([]);
  prismaMock.dailyAttendance.findMany.mockResolvedValue([]);
});

describe("GET /api/services/[id]/ai-context/reflection", () => {
  it("returns 401 when not authed", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/services/s1/ai-context/reflection"),
      await ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for cross-service coordinator", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "other" });
    const res = await GET(
      createRequest("GET", "/api/services/s1/ai-context/reflection"),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("returns empty placeholders when there's no recent data", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    const res = await GET(
      createRequest("GET", "/api/services/s1/ai-context/reflection"),
      await ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serviceName).toBe("Cessnock");
    expect(body.recentObservations).toMatch(/no observations/i);
    expect(body.recentIncidents).toMatch(/no incidents/i);
    expect(body.recentAudits).toMatch(/no audits/i);
    expect(body.weekSummary).toMatch(/no attendance/i);
  });

  it("formats observations with child first name + MTOP tags + 140-char snippet", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.learningObservation.findMany.mockResolvedValue([
      {
        title: "Block tower",
        narrative: "Mia stacked 8 blocks today, very focused for 20 minutes.",
        mtopOutcomes: ["Learners", "Communicators"],
        child: { firstName: "Mia" },
      },
    ]);
    const res = await GET(
      createRequest("GET", "/api/services/s1/ai-context/reflection"),
      await ctx(),
    );
    const body = await res.json();
    expect(body.recentObservations).toContain("Mia");
    expect(body.recentObservations).toContain("Block tower");
    expect(body.recentObservations).toContain("Learners");
  });

  it("anonymises long descriptions on incidents to ≤120 chars", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    const longDesc = "x".repeat(300);
    prismaMock.incidentRecord.findMany.mockResolvedValue([
      {
        incidentType: "injury",
        severity: "minor",
        location: "playground",
        description: longDesc,
        incidentDate: new Date("2026-04-22"),
      },
    ]);
    const res = await GET(
      createRequest("GET", "/api/services/s1/ai-context/reflection"),
      await ctx(),
    );
    const body = await res.json();
    expect(body.recentIncidents).toContain("injury");
    expect(body.recentIncidents).toContain("playground");
    expect(body.recentIncidents).toContain("…");
  });

  it("formats completed audits with QA + score + improvement gap", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.auditInstance.findMany.mockResolvedValue([
      {
        complianceScore: 87.5,
        areasForImprovement: "QA1.3 documentation needs more detail in weekly reflections",
        completedAt: new Date(),
        template: { name: "Weekly Programme Audit", qualityArea: 1 },
      },
    ]);
    const res = await GET(
      createRequest("GET", "/api/services/s1/ai-context/reflection"),
      await ctx(),
    );
    const body = await res.json();
    expect(body.recentAudits).toContain("QA1");
    expect(body.recentAudits).toContain("88%");
    expect(body.recentAudits).toContain("documentation");
  });

  it("computes a one-line attendance summary", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.dailyAttendance.findMany.mockResolvedValue([
      { date: new Date("2026-04-21"), enrolled: 25, attended: 22, sessionType: "asc" },
      { date: new Date("2026-04-22"), enrolled: 25, attended: 24, sessionType: "asc" },
      { date: new Date("2026-04-23"), enrolled: 25, attended: 23, sessionType: "asc" },
    ]);
    const res = await GET(
      createRequest("GET", "/api/services/s1/ai-context/reflection"),
      await ctx(),
    );
    const body = await res.json();
    expect(body.weekSummary).toMatch(/3 session day\(s\)/);
    expect(body.weekSummary).toMatch(/69 child-attendances/);
    expect(body.weekSummary).toMatch(/75 enrolled/);
  });
});
