import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
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

import { POST } from "@/app/api/roster/shifts/[id]/claim/route";

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeOpenShift(overrides: Record<string, unknown> = {}) {
  return {
    id: "sh-open-1",
    serviceId: "svc-1",
    userId: null,
    staffName: "Open shift",
    date: new Date("2026-05-15"),
    sessionType: "asc",
    shiftStart: "15:00",
    shiftEnd: "18:00",
    role: "educator",
    status: "published",
    publishedAt: new Date(),
    createdById: "admin-1",
    syncedAt: new Date(),
    ...overrides,
  };
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    if (select && "name" in select) return Promise.resolve({ name: "Lookup User" });
    return Promise.resolve({ active: true, name: "Lookup User" });
  });
  // Default: no expired certs (cert-guard passes).
  prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
}

describe("POST /api/roster/shifts/[id]/claim", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-open-1/claim"),
      paramsOf("sh-open-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the shift does not exist", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/missing/claim"),
      paramsOf("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when the shift already has an assignee", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(
      makeOpenShift({ userId: "u-other", staffName: "Bob" }),
    );
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-open-1/claim"),
      paramsOf("sh-open-1"),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.rosterShift.updateMany).not.toHaveBeenCalled();
  });

  it("returns 403 when claimer is at a different service", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-other" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeOpenShift());
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-open-1/claim"),
      paramsOf("sh-open-1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.rosterShift.updateMany).not.toHaveBeenCalled();
  });

  it("returns 400 when claimer has an expired blocking cert", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeOpenShift());
    // Shift date 2026-05-15; WWCC expired 2026-04-01.
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      { type: "wwcc", expiryDate: new Date("2026-04-01") },
    ]);
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-open-1/claim"),
      paramsOf("sh-open-1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/WWCC/);
    expect(prismaMock.rosterShift.updateMany).not.toHaveBeenCalled();
  });

  it("claims the shift on happy path (member at the same service)", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "member", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique
      // 1st call: pre-claim look-up
      .mockResolvedValueOnce(makeOpenShift())
      // 2nd call: post-claim re-fetch
      .mockResolvedValueOnce(
        makeOpenShift({ userId: "u-1", staffName: "Alice" }),
      );
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { where, select } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select) return Promise.resolve({ active: true });
      if (where?.id === "u-1") return Promise.resolve({ name: "Alice" });
      return Promise.resolve(null);
    });
    prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-open-1/claim"),
      paramsOf("sh-open-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shift.userId).toBe("u-1");
    expect(body.shift.staffName).toBe("Alice");

    // Verify the race-condition-safe filter.
    const updateCall = prismaMock.rosterShift.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "sh-open-1", userId: null });
    expect(updateCall.data.userId).toBe("u-1");
  });

  it("returns 409 when the race-condition-safe update finds nothing to update", async () => {
    // Pre-claim look-up showed userId=null; by the time updateMany ran,
    // someone else had already won the race → count=0.
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeOpenShift());
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { where, select } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select) return Promise.resolve({ active: true });
      if (where?.id === "u-1") return Promise.resolve({ name: "Alice" });
      return Promise.resolve(null);
    });
    prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-open-1/claim"),
      paramsOf("sh-open-1"),
    );
    expect(res.status).toBe(409);
  });

  it("admin can claim a shift at any service (org-wide bypass)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findUnique
      .mockResolvedValueOnce(makeOpenShift({ serviceId: "svc-other" }))
      .mockResolvedValueOnce(
        makeOpenShift({ serviceId: "svc-other", userId: "admin-1", staffName: "Admin" }),
      );
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { where, select } = args as {
        where?: { id?: string };
        select?: Record<string, boolean>;
      };
      if (select && "active" in select) return Promise.resolve({ active: true });
      if (where?.id === "admin-1") return Promise.resolve({ name: "Admin" });
      return Promise.resolve(null);
    });
    prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-open-1/claim"),
      paramsOf("sh-open-1"),
    );
    expect(res.status).toBe(200);
  });
});
