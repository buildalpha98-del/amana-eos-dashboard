import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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
import { GET, POST } from "@/app/api/services/[id]/risk-assessments/route";
import { POST as APPROVE } from "@/app/api/services/[id]/risk-assessments/[raId]/approve/route";
import { POST as EVENTS_POST } from "@/app/api/services/[id]/events/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}
async function approveCtx(id = "s1", raId = "ra1") {
  return { params: Promise.resolve({ id, raId }) };
}

describe("risk-assessments API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("POST 400 when no hazards", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    const res = await POST(
      createRequest("POST", "/api/services/s1/risk-assessments", {
        body: {
          title: "Zoo trip",
          activityType: "excursion",
          date: "2026-05-10",
          hazards: [],
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("POST creates a risk assessment", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
    prismaMock.riskAssessment.create.mockResolvedValue({
      id: "ra1",
      title: "Zoo trip",
      activityType: "excursion",
      date: new Date("2026-05-10"),
      author: { id: "u1", name: "C", avatar: null },
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await POST(
      createRequest("POST", "/api/services/s1/risk-assessments", {
        body: {
          title: "Zoo trip",
          activityType: "excursion",
          date: "2026-05-10",
          hazards: [
            { hazard: "Traffic", likelihood: 3, severity: 4, controls: "Buddy system" },
          ],
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(201);
  });

  it("GET filters by approved status", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.riskAssessment.findMany.mockResolvedValue([]);
    await GET(
      createRequest("GET", "/api/services/s1/risk-assessments?status=approved"),
      await ctx(),
    );
    expect(prismaMock.riskAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ approvedAt: { not: null } }),
      }),
    );
  });

  it("approve 400 when approver is the author", async () => {
    mockSession({
      id: "u1",
      name: "Author",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.riskAssessment.findUnique.mockResolvedValue({
      id: "ra1",
      serviceId: "s1",
      authorId: "u1",
      approvedAt: null,
    });
    const res = await APPROVE(
      createRequest("POST", "/api/services/s1/risk-assessments/ra1/approve"),
      await approveCtx(),
    );
    expect(res.status).toBe(400);
  });

  it("approve 200 when different user approves", async () => {
    mockSession({
      id: "u2",
      name: "Approver",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.riskAssessment.findUnique.mockResolvedValue({
      id: "ra1",
      serviceId: "s1",
      authorId: "u1",
      approvedAt: null,
    });
    prismaMock.riskAssessment.update.mockResolvedValue({
      id: "ra1",
      activityType: "excursion",
      date: new Date("2026-05-10"),
      approvedAt: new Date(),
      approvedBy: { id: "u2", name: "Approver", avatar: null },
      author: { id: "u1", name: "Author", avatar: null },
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await APPROVE(
      createRequest("POST", "/api/services/s1/risk-assessments/ra1/approve"),
      await approveCtx(),
    );
    expect(res.status).toBe(200);
  });
});

describe("excursion ServiceEvent gate with RiskAssessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("rejects excursion when RA is not approved", async () => {
    mockSession({
      id: "u1",
      name: "Owner",
      role: "owner",
    });
    prismaMock.riskAssessment.findUnique.mockResolvedValue({
      id: "ra1",
      serviceId: "s1",
      activityType: "excursion",
      date: new Date("2026-05-10"),
      approvedAt: null,
    });
    const res = await EVENTS_POST(
      createRequest("POST", "/api/services/s1/events", {
        body: {
          eventType: "excursion",
          title: "Zoo trip",
          date: "2026-05-10",
          riskAssessmentId: "cjraaaaaaaaaaaaaaaaaaaaaa",
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/approved/i);
  });

  it("rejects excursion when RA activityType is wrong", async () => {
    mockSession({
      id: "u1",
      name: "Owner",
      role: "owner",
    });
    prismaMock.riskAssessment.findUnique.mockResolvedValue({
      id: "ra1",
      serviceId: "s1",
      activityType: "routine",
      date: new Date("2026-05-10"),
      approvedAt: new Date(),
    });
    const res = await EVENTS_POST(
      createRequest("POST", "/api/services/s1/events", {
        body: {
          eventType: "excursion",
          title: "Zoo trip",
          date: "2026-05-10",
          riskAssessmentId: "cjraaaaaaaaaaaaaaaaaaaaaa",
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("accepts excursion when RA is approved, matches service+type+date", async () => {
    mockSession({
      id: "u1",
      name: "Owner",
      role: "owner",
    });
    prismaMock.riskAssessment.findUnique.mockResolvedValue({
      id: "ra1",
      serviceId: "s1",
      activityType: "excursion",
      date: new Date(Date.UTC(2026, 4, 10)),
      approvedAt: new Date(),
    });
    prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
    prismaMock.serviceEvent.create.mockResolvedValue({
      id: "e1",
      eventType: "excursion",
      title: "Zoo trip",
      date: new Date("2026-05-10"),
      createdBy: { id: "u1", name: "Owner", avatar: null },
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await EVENTS_POST(
      createRequest("POST", "/api/services/s1/events", {
        body: {
          eventType: "excursion",
          title: "Zoo trip",
          date: "2026-05-10",
          riskAssessmentId: "cjraaaaaaaaaaaaaaaaaaaaaa",
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(201);
  });
});
