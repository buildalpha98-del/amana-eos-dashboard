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

import { POST } from "@/app/api/roster/shifts/[id]/release/route";

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeClaimedShift(overrides: Record<string, unknown> = {}) {
  return {
    id: "sh-1",
    serviceId: "svc-1",
    userId: "u-1",
    staffName: "Alice",
    actualStart: null,
    status: "published",
    date: new Date("2026-05-15"),
    sessionType: "asc",
    shiftStart: "15:00",
    shiftEnd: "18:00",
    role: "educator",
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
    return Promise.resolve({ active: true });
  });
  // Default: no in-flight swap requests.
  prismaMock.shiftSwapRequest.findFirst.mockResolvedValue(null);
}

describe("POST /api/roster/shifts/[id]/release", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-1/release"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the shift does not exist", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/missing/release"),
      paramsOf("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with alreadyOpen flag when the shift is already unassigned (idempotent)", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(
      makeClaimedShift({ userId: null, staffName: "Open shift" }),
    );
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-1/release"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, alreadyOpen: true });
    expect(prismaMock.rosterShift.updateMany).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not the assignee and not an admin", async () => {
    mockSession({ id: "u-other", name: "Bob", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeClaimedShift());
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-1/release"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.rosterShift.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the assignee has already clocked in", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(
      makeClaimedShift({ actualStart: new Date("2026-05-15T15:02:00Z") }),
    );
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-1/release"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/clocked in/i);
    expect(prismaMock.rosterShift.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when there is an in-flight swap request", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeClaimedShift());
    prismaMock.shiftSwapRequest.findFirst.mockResolvedValue({ id: "swap-1" });
    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-1/release"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/swap/i);
    expect(prismaMock.rosterShift.updateMany).not.toHaveBeenCalled();
  });

  it("releases the shift on happy path and returns the updated row", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique
      // 1st call: pre-release look-up
      .mockResolvedValueOnce(makeClaimedShift())
      // 2nd call: post-release re-fetch (with user relation hydrated)
      .mockResolvedValueOnce(
        makeClaimedShift({ userId: null, staffName: "Open shift", user: null }),
      );
    prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-1/release"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shift.userId).toBeNull();
    expect(body.shift.staffName).toBe("Open shift");

    // Verify the race-condition-safe filter — only releases if the
    // caller is still the assignee AND the shift hasn't been clocked in to.
    const updateCall = prismaMock.rosterShift.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({
      id: "sh-1",
      userId: "u-1",
      actualStart: null,
    });
    expect(updateCall.data.userId).toBeNull();
    expect(updateCall.data.staffName).toBe("Open shift");
  });

  it("returns 409 when the race-safe update finds nothing (someone clocked in or got reassigned mid-call)", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.rosterShift.findUnique.mockResolvedValue(makeClaimedShift());
    prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-1/release"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(409);
  });

  it("admin can release a shift on behalf of another staff member", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.rosterShift.findUnique
      .mockResolvedValueOnce(makeClaimedShift({ userId: "u-other", staffName: "Bob" }))
      .mockResolvedValueOnce(
        makeClaimedShift({ userId: null, staffName: "Open shift", user: null }),
      );
    prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(
      createRequest("POST", "/api/roster/shifts/sh-1/release"),
      paramsOf("sh-1"),
    );
    expect(res.status).toBe(200);

    // Admin override path uses the existing assignee's userId in the
    // race-safe filter, not the admin's own id.
    const updateCall = prismaMock.rosterShift.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({
      id: "sh-1",
      userId: "u-other",
      actualStart: null,
    });
  });
});
