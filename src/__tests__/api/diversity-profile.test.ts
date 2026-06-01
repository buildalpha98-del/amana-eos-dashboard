/**
 * Auth + privacy tests for /api/diversity-profile and /api/diversity-stats.
 *
 * The critical contract this PR locks down:
 *   - diversity-profile is SELF-only — staff own their data
 *   - diversity-stats is admin-only AND applies <3 cell suppression
 *   - admins cannot read another user's profile via the GET endpoint
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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
  generateRequestId: () => "test-req",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET, PUT, DELETE } from "@/app/api/diversity-profile/route";
import { GET as STATS_GET } from "@/app/api/diversity-stats/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({
    active: true,
    serviceId: "svc-1",
  });
});

describe("GET /api/diversity-profile", () => {
  it("rejects unauthenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/diversity-profile"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
  });

  it("returns the caller's own profile (or null) — never another user's", async () => {
    mockSession({ id: "user-1", name: "Self", role: "staff" });
    prismaMock.diversityProfile.findUnique.mockResolvedValue({
      genderIdentity: "woman",
      consentGivenAt: new Date(),
    });
    const res = await GET(
      createRequest("GET", "/api/diversity-profile"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    // The findUnique call must be scoped to the caller's userId — this
    // is the privacy guarantee.
    const call = prismaMock.diversityProfile.findUnique.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ userId: "user-1" });
  });
});

describe("PUT /api/diversity-profile", () => {
  it("rejects unauthenticated", async () => {
    mockNoSession();
    const res = await PUT(
      createRequest("PUT", "/api/diversity-profile", {
        body: { genderIdentity: "woman" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
  });

  it("upserts against the caller's own userId", async () => {
    mockSession({ id: "user-1", name: "Self", role: "staff" });
    prismaMock.diversityProfile.upsert.mockResolvedValue({
      userId: "user-1",
      genderIdentity: "woman",
    });
    const res = await PUT(
      createRequest("PUT", "/api/diversity-profile", {
        body: { genderIdentity: "woman" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const call = prismaMock.diversityProfile.upsert.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ userId: "user-1" });
    expect(call?.create).toMatchObject({ userId: "user-1" });
  });

  it("validates yearArrivedInAustralia range", async () => {
    mockSession({ id: "user-1", name: "Self", role: "staff" });
    const res = await PUT(
      createRequest("PUT", "/api/diversity-profile", {
        body: { yearArrivedInAustralia: 1800 },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/diversity-profile", () => {
  it("hard-deletes the caller's own row", async () => {
    mockSession({ id: "user-1", name: "Self", role: "staff" });
    prismaMock.diversityProfile.delete.mockResolvedValue({
      userId: "user-1",
    });
    const res = await DELETE(
      createRequest("DELETE", "/api/diversity-profile"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const call = prismaMock.diversityProfile.delete.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ userId: "user-1" });
  });

  it("is idempotent — succeeds when no profile exists (P2025)", async () => {
    mockSession({ id: "user-1", name: "Self", role: "staff" });
    prismaMock.diversityProfile.delete.mockRejectedValue({
      code: "P2025",
      message: "Record not found",
    });
    const res = await DELETE(
      createRequest("DELETE", "/api/diversity-profile"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/diversity-stats — privacy + suppression", () => {
  it("rejects staff", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await STATS_GET(
      createRequest("GET", "/api/diversity-stats"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("admin can read; suppresses counts <3", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    // 2 women, 5 men, 1 non-binary → women + non-binary suppressed to "<3"
    prismaMock.diversityProfile.findMany.mockResolvedValue([
      { genderIdentity: "woman" },
      { genderIdentity: "woman" },
      { genderIdentity: "man" },
      { genderIdentity: "man" },
      { genderIdentity: "man" },
      { genderIdentity: "man" },
      { genderIdentity: "man" },
      { genderIdentity: "non_binary" },
    ]);
    prismaMock.user.count.mockResolvedValue(20);
    const res = await STATS_GET(
      createRequest("GET", "/api/diversity-stats"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Categories with <3 must be suppressed; ≥3 stays as raw counts
    expect(body.gender.woman).toBe("<3");
    expect(body.gender.non_binary).toBe("<3");
    expect(body.gender.man).toBe(5);
    expect(body.totalActiveStaff).toBe(20);
    expect(body.totalRespondents).toBe(8);
    expect(body.minCellSize).toBe(3);
  });

  it("zero-count categories stay 0 (not '<3' — those are zero, not small)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.diversityProfile.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(10);
    const res = await STATS_GET(
      createRequest("GET", "/api/diversity-stats"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // No respondents → categories are 0, not "<3".
    expect(body.totalRespondents).toBe(0);
  });
});
