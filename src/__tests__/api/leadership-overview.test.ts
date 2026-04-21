import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/leadership/overview/route";

describe("GET /api/leadership/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/leadership/overview"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await GET(createRequest("GET", "/api/leadership/overview"));
    expect(res.status).toBe(403);
  });

  it("returns aggregated KPIs for owner", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });

    prismaMock.user.count.mockResolvedValue(42);
    prismaMock.service.count.mockResolvedValue(7);
    prismaMock.issue.count.mockResolvedValue(3);
    prismaMock.supportTicket.count.mockResolvedValue(12);
    // RockStatus enum: on_track | off_track | complete | dropped (no at_risk)
    prismaMock.rock.findMany.mockResolvedValue([
      { id: "r1", status: "on_track", serviceId: "s1", service: { id: "s1", name: "Centre A" } },
      { id: "r2", status: "off_track", serviceId: "s1", service: { id: "s1", name: "Centre A" } },
      { id: "r3", status: "complete", serviceId: "s2", service: { id: "s2", name: "Centre B" } },
      { id: "r4", status: "dropped", serviceId: null, service: null },
      { id: "r5", status: "on_track", serviceId: null, service: null },
    ]);
    prismaMock.weeklyPulse.findMany.mockResolvedValue([
      { weekOf: new Date("2026-04-06"), mood: 4 },
      { weekOf: new Date("2026-04-06"), mood: 5 },
      { weekOf: new Date("2026-04-13"), mood: 3 },
      { weekOf: new Date("2026-04-20"), mood: 4 },
    ]);

    const res = await GET(createRequest("GET", "/api/leadership/overview"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.staffCount).toBe(42);
    expect(body.serviceCount).toBe(7);
    expect(body.openIssueCount).toBe(3);
    expect(body.openTicketCount).toBe(12);

    expect(body.rocksRollup.total).toBe(5);
    expect(body.rocksRollup.onTrack).toBe(2);
    expect(body.rocksRollup.offTrack).toBe(1);
    expect(body.rocksRollup.complete).toBe(1);
    expect(body.rocksRollup.dropped).toBe(1);
    expect(body.rocksRollup.byService).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serviceId: "s1", serviceName: "Centre A", total: 2, onTrack: 1 }),
        expect.objectContaining({ serviceId: "s2", serviceName: "Centre B", total: 1, onTrack: 0 }),
      ])
    );

    expect(Array.isArray(body.sentimentTrend)).toBe(true);
    expect(body.sentimentTrend.length).toBeGreaterThan(0);
    const wk1 = body.sentimentTrend.find((w: { weekOf: string }) => w.weekOf.startsWith("2026-04-06"));
    expect(wk1?.avgMood).toBe(4.5);

    // IssueStatus enum is open | in_discussion | solved | closed — verify "open" path
    const issueCall = prismaMock.issue.count.mock.calls[0][0];
    expect(issueCall.where.status.notIn).toEqual(["solved", "closed"]);
  });

  it("returns 200 for head_office and admin", async () => {
    for (const role of ["head_office", "admin"] as const) {
      vi.clearAllMocks();
      _clearUserActiveCache();
      prismaMock.user.findUnique.mockResolvedValue({ active: true });
      prismaMock.user.count.mockResolvedValue(0);
      prismaMock.service.count.mockResolvedValue(0);
      prismaMock.issue.count.mockResolvedValue(0);
      prismaMock.supportTicket.count.mockResolvedValue(0);
      prismaMock.rock.findMany.mockResolvedValue([]);
      prismaMock.weeklyPulse.findMany.mockResolvedValue([]);
      mockSession({ id: "u", name: "U", role });
      const res = await GET(createRequest("GET", "/api/leadership/overview"));
      expect(res.status).toBe(200);
    }
  });
});
