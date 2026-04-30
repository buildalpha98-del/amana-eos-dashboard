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
import { GET } from "@/app/api/contact-centre/leaderboard/route";

describe("GET /api/contact-centre/leaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 403 for non-admin", async () => {
    mockSession({ id: "u", name: "S", role: "staff" });
    const res = await GET(createRequest("GET", "/api/contact-centre/leaderboard"));
    expect(res.status).toBe(403);
  });

  it("computes per-coordinator metrics", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });

    prismaMock.user.findMany.mockResolvedValue([
      { id: "c1", name: "Ali", email: "ali@x.com", avatar: null, role: "member" },
      { id: "c2", name: "Bea", email: "bea@x.com", avatar: null, role: "member" },
    ]);
    prismaMock.supportTicket.findMany.mockResolvedValue([
      { id: "t1", assignedToId: "c1", status: "resolved",
        createdAt: new Date("2026-04-01T09:00:00Z"),
        firstResponseAt: new Date("2026-04-01T09:10:00Z"),
        resolvedAt: new Date("2026-04-01T10:00:00Z") },
      { id: "t2", assignedToId: "c1", status: "open",
        createdAt: new Date("2026-04-02T09:00:00Z"),
        firstResponseAt: new Date("2026-04-02T09:10:00Z"),
        resolvedAt: null },
      { id: "t3", assignedToId: "c2", status: "resolved",
        createdAt: new Date("2026-04-03T09:00:00Z"),
        firstResponseAt: new Date("2026-04-03T09:30:00Z"),
        resolvedAt: new Date("2026-04-03T11:00:00Z") },
    ]);
    prismaMock.parentEnquiry.findMany.mockResolvedValue([
      { id: "e1", assigneeId: "c1", stage: "enrolled" },
      { id: "e2", assigneeId: "c1", stage: "nurturing" },
      { id: "e3", assigneeId: "c2", stage: "enrolled" },
      { id: "e4", assigneeId: "c2", stage: "enrolled" },
    ]);

    const res = await GET(createRequest("GET", "/api/contact-centre/leaderboard"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.rows).toHaveLength(2);
    const ali = body.rows.find((r: { userId: string }) => r.userId === "c1");
    expect(ali.ticketsAssigned).toBe(2);
    expect(ali.ticketsResolved).toBe(1);
    expect(ali.avgFirstResponseMin).toBe(10);
    expect(ali.enquiriesConverted).toBe(1);
    expect(ali.enquiriesTotal).toBe(2);

    const bea = body.rows.find((r: { userId: string }) => r.userId === "c2");
    expect(bea.ticketsAssigned).toBe(1);
    expect(bea.avgFirstResponseMin).toBe(30);
    expect(bea.enquiriesConverted).toBe(2);
  });

  it("supports ?days=30 filter", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    prismaMock.parentEnquiry.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/contact-centre/leaderboard?days=30"));
    const ticketCall = prismaMock.supportTicket.findMany.mock.calls[0][0];
    expect(ticketCall.where.createdAt?.gte).toBeDefined();
  });
});
