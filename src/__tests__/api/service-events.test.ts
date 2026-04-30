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
import { GET, POST } from "@/app/api/services/[id]/events/route";

async function context() {
  return { params: Promise.resolve({ id: "s1" }) };
}

describe("GET /api/services/[id]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 without session", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/services/s1/events"),
      await context(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for coordinator of different service", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "other",
    });
    const res = await GET(
      createRequest("GET", "/api/services/s1/events"),
      await context(),
    );
    expect(res.status).toBe(403);
  });

  it("returns events for own-service coordinator", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.serviceEvent.findMany.mockResolvedValue([
      {
        id: "e1",
        eventType: "excursion",
        title: "Zoo trip",
        date: new Date("2026-05-01"),
        createdBy: { id: "u1", name: "C", avatar: null },
      },
    ]);
    const res = await GET(
      createRequest("GET", "/api/services/s1/events"),
      await context(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe("Zoo trip");
  });
});

describe("POST /api/services/[id]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 400 on invalid body", async () => {
    mockSession({
      id: "u1",
      name: "Owner",
      role: "owner",
    });
    const res = await POST(
      createRequest("POST", "/api/services/s1/events", { body: { title: "" } }),
      await context(),
    );
    expect(res.status).toBe(400);
  });

  it("blocks excursion creation without a risk assessment", async () => {
    mockSession({
      id: "u1",
      name: "Owner",
      role: "owner",
    });
    const res = await POST(
      createRequest("POST", "/api/services/s1/events", {
        body: {
          eventType: "excursion",
          title: "Zoo trip",
          date: "2026-05-01",
        },
      }),
      await context(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/risk assessment/i);
  });

  it("creates a non-excursion event happily", async () => {
    mockSession({
      id: "u1",
      name: "Owner",
      role: "owner",
    });
    prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
    prismaMock.serviceEvent.create.mockResolvedValue({
      id: "new-e1",
      serviceId: "s1",
      eventType: "incursion",
      title: "Reptile visit",
      date: new Date("2026-05-10"),
      createdBy: { id: "u1", name: "Owner", avatar: null },
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const res = await POST(
      createRequest("POST", "/api/services/s1/events", {
        body: {
          eventType: "incursion",
          title: "Reptile visit",
          date: "2026-05-10",
        },
      }),
      await context(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Reptile visit");
  });

  it("allows excursion creation when a risk assessment id is supplied", async () => {
    mockSession({
      id: "u1",
      name: "Owner",
      role: "owner",
    });
    prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
    prismaMock.riskAssessment.findUnique.mockResolvedValue({
      id: "cjxxxxxxxxxxxxxxxxxxxxxxx",
      serviceId: "s1",
      activityType: "excursion",
      date: new Date(Date.UTC(2026, 4, 15)),
      approvedAt: new Date(),
    });
    prismaMock.serviceEvent.create.mockResolvedValue({
      id: "e2",
      serviceId: "s1",
      eventType: "excursion",
      title: "Zoo trip",
      date: new Date("2026-05-15"),
      createdBy: { id: "u1", name: "Owner", avatar: null },
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const res = await POST(
      createRequest("POST", "/api/services/s1/events", {
        body: {
          eventType: "excursion",
          title: "Zoo trip",
          date: "2026-05-15",
          riskAssessmentId: "cjxxxxxxxxxxxxxxxxxxxxxxx",
        },
      }),
      await context(),
    );
    expect(res.status).toBe(201);
  });

  it.skip("returns 403 for a member // SKIP 2026-04-30: stale post coordinator-collapse, needs rewrite", async () => {
    mockSession({
      id: "u1",
      name: "Staff",
      role: "member",
      serviceId: "s1",
    });
    const res = await POST(
      createRequest("POST", "/api/services/s1/events", {
        body: {
          eventType: "incursion",
          title: "Reptile visit",
          date: "2026-05-10",
        },
      }),
      await context(),
    );
    expect(res.status).toBe(403);
  });
});
