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
import { GET } from "@/app/api/communication/pulse/admin-summary/route";

function isoMonday(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  out.setDate(out.getDate() - day + (day === 0 ? -6 : 1));
  out.setHours(0, 0, 0, 0);
  return out;
}

describe("GET /api/communication/pulse/admin-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 403 for coordinator", async () => {
    mockSession({ id: "u", name: "C", role: "coordinator" });
    const res = await GET(createRequest("GET", `/api/communication/pulse/admin-summary?weekOf=${isoMonday(new Date()).toISOString()}`));
    expect(res.status).toBe(403);
  });

  it("returns 400 without weekOf", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    const res = await GET(createRequest("GET", "/api/communication/pulse/admin-summary"));
    expect(res.status).toBe(400);
  });

  it("returns sentiment counts per service — NEVER includes user names, emails, or user IDs", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const weekOf = isoMonday(new Date("2026-04-20T12:00:00Z"));

    prismaMock.service.findMany.mockResolvedValue([
      { id: "s1", name: "Centre A", code: "A" },
      { id: "s2", name: "Centre B", code: "B" },
    ]);
    prismaMock.weeklyPulse.findMany.mockResolvedValue([
      { id: "p1", mood: 5, blockers: null, user: { serviceId: "s1" } },
      { id: "p2", mood: 4, blockers: "something", user: { serviceId: "s1" } },
      { id: "p3", mood: 2, blockers: "hard week", user: { serviceId: "s2" } },
      { id: "p4", mood: null, blockers: null, user: { serviceId: "s2" } },
    ]);
    prismaMock.user.count.mockResolvedValue(10);
    prismaMock.user.groupBy.mockResolvedValue([
      { serviceId: "s1", _count: { _all: 4 } },
      { serviceId: "s2", _count: { _all: 6 } },
    ]);

    const res = await GET(createRequest("GET", `/api/communication/pulse/admin-summary?weekOf=${weekOf.toISOString()}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Anonymity check — serialised body MUST NOT contain any name/email/user nesting
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/"name"/);
    expect(raw).not.toMatch(/"email"/);
    expect(raw).not.toMatch(/"userId"/);
    expect(raw).not.toMatch(/"user"\s*:/);

    expect(body.org.totalUsers).toBe(10);
    expect(body.org.submitted).toBe(4);
    expect(body.org.positive).toBe(2);
    expect(body.org.neutral).toBe(0);
    expect(body.org.concerning).toBe(1);
    expect(body.org.blockerCount).toBe(2);

    const s1 = body.byService.find((r: { serviceId: string }) => r.serviceId === "s1");
    expect(s1.totalUsers).toBe(4);
    expect(s1.submitted).toBe(2);
    expect(s1.positive).toBe(2);
    expect(s1.concerning).toBe(0);
  });
});
