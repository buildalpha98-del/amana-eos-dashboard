import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

// Mock logger
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

// Import after mocks
import { GET, POST } from "@/app/api/staff-referrals/route";
import { PATCH } from "@/app/api/staff-referrals/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/staff-referrals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/staff-referrals");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when non-admin member tries to list", async () => {
    mockSession({ id: "u-1", name: "Test", role: "member" });
    const req = createRequest("GET", "/api/staff-referrals");
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("returns 200 with list for admin", async () => {
    mockSession({ id: "u-1", name: "Test", role: "admin" });

    const mockReferrals = [
      {
        id: "ref-1",
        referrerUserId: "u-2",
        referrerUser: {
          id: "u-2",
          name: "Referrer",
          email: "r@test.com",
          avatar: null,
        },
        referredName: "New Candidate",
        referredEmail: "nc@test.com",
        candidateId: null,
        candidate: null,
        status: "pending",
        bonusAmount: 200,
        bonusPaidAt: null,
        createdAt: new Date("2026-04-22"),
        updatedAt: new Date("2026-04-22"),
      },
    ];
    prismaMock.staffReferral.findMany.mockResolvedValue(mockReferrals);

    const req = createRequest("GET", "/api/staff-referrals");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].referredName).toBe("New Candidate");
  });
});

describe("POST /api/staff-referrals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 400 with bad body", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });

    const req = createRequest("POST", "/api/staff-referrals", {
      body: { referrerUserId: "" }, // missing referredName
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("creates referral with valid data", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });

    const created = {
      id: "ref-new",
      referrerUserId: "u-2",
      referredName: "Candidate Name",
      referredEmail: "candidate@test.com",
      candidateId: null,
      status: "pending",
      bonusAmount: 200,
      bonusPaidAt: null,
      lastReminderAt: null,
      createdAt: new Date("2026-04-22"),
      updatedAt: new Date("2026-04-22"),
    };
    prismaMock.staffReferral.create.mockResolvedValue(created);

    const req = createRequest("POST", "/api/staff-referrals", {
      body: {
        referrerUserId: "u-2",
        referredName: "Candidate Name",
        referredEmail: "candidate@test.com",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("ref-new");
    expect(prismaMock.staffReferral.create).toHaveBeenCalled();
  });
});

describe("PATCH /api/staff-referrals/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();

    const req = createRequest("PATCH", "/api/staff-referrals/ref-1", {
      body: { status: "hired" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "ref-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin tries to update", async () => {
    mockSession({ id: "u-1", name: "Test", role: "staff" });

    const req = createRequest("PATCH", "/api/staff-referrals/ref-1", {
      body: { status: "hired" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "ref-1" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when referral not found", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.staffReferral.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/staff-referrals/unknown", {
      body: { status: "hired" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "unknown" }),
    });

    expect(res.status).toBe(404);
  });

  it("marks bonus paid and sets bonusPaidAt to now by default", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });

    const existing = {
      id: "ref-1",
      referrerUserId: "u-2",
      referredName: "Candidate",
      status: "hired",
      bonusAmount: 200,
      bonusPaidAt: null,
    };
    prismaMock.staffReferral.findUnique.mockResolvedValue(existing);

    const updated = {
      ...existing,
      status: "bonus_paid",
      bonusAmount: 200,
      bonusPaidAt: new Date(),
    };
    prismaMock.staffReferral.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/staff-referrals/ref-1", {
      body: { status: "bonus_paid", bonusAmount: 200 },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "ref-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("bonus_paid");

    // Confirm activity log fired with pay_bonus action
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
    const logCall = prismaMock.activityLog.create.mock.calls[0][0];
    expect(logCall.data.action).toBe("pay_bonus");
    expect(logCall.data.entityType).toBe("StaffReferral");

    // Confirm bonusPaidAt got set in update call
    const updateCall = prismaMock.staffReferral.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("bonus_paid");
    expect(updateCall.data.bonusPaidAt).toBeInstanceOf(Date);
  });

  it("accepts explicit bonusPaidAt date when provided", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });

    const existing = {
      id: "ref-2",
      status: "pending",
      bonusAmount: 200,
      bonusPaidAt: null,
    };
    prismaMock.staffReferral.findUnique.mockResolvedValue(existing);
    prismaMock.staffReferral.update.mockResolvedValue({
      ...existing,
      status: "bonus_paid",
      bonusPaidAt: new Date("2026-04-01T00:00:00Z"),
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/staff-referrals/ref-2", {
      body: {
        status: "bonus_paid",
        bonusPaidAt: "2026-04-01T00:00:00.000Z",
        bonusAmount: 250,
      },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "ref-2" }),
    });

    expect(res.status).toBe(200);
    const updateCall = prismaMock.staffReferral.update.mock.calls[0][0];
    expect((updateCall.data.bonusPaidAt as Date).toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
    expect(updateCall.data.bonusAmount).toBe(250);
  });

  it("rejects marking paid from expired status", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });

    prismaMock.staffReferral.findUnique.mockResolvedValue({
      id: "ref-3",
      status: "expired",
      bonusAmount: 200,
      bonusPaidAt: null,
    });

    const req = createRequest("PATCH", "/api/staff-referrals/ref-3", {
      body: { status: "bonus_paid" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "ref-3" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Cannot mark as paid");
  });

  it("rejects marking paid from already-paid status", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });

    prismaMock.staffReferral.findUnique.mockResolvedValue({
      id: "ref-4",
      status: "bonus_paid",
      bonusAmount: 200,
      bonusPaidAt: new Date("2026-01-01"),
    });

    const req = createRequest("PATCH", "/api/staff-referrals/ref-4", {
      body: { status: "bonus_paid" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "ref-4" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Cannot mark as paid");
  });
});
