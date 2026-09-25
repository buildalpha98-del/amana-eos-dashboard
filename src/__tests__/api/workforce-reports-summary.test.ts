/**
 * Tests for GET /api/workforce-reports/summary — the Workforce tab
 * aggregate (Staff Portal v2 Phase 10, Task 10.1).
 *
 * Covers auth (401), role gating (403), and the bucket maths for
 * headcounts, starters/leavers month bucketing, tenure distribution,
 * training completion and cert-expiry outlook. The clock is frozen at
 * 2026-09-05 so month/tenure expectations are deterministic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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

import { GET } from "@/app/api/workforce-reports/summary/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Frozen "now": Saturday 5 Sep 2026 (local). Trailing-12-month window is
// therefore 2025-10 .. 2026-09.
const NOW = new Date(2026, 8, 5, 12, 0, 0);

const USERS = [
  {
    // 5y+ tenure, started before the 12-month window → not a starter.
    role: "owner",
    serviceId: "svc-1",
    employmentType: "permanent",
    startDate: new Date(2020, 0, 15),
    createdAt: new Date(2026, 6, 1),
  },
  {
    // <6mo tenure, starter in 2026-08 (startDate wins over createdAt).
    role: "staff",
    serviceId: "svc-1",
    employmentType: "casual",
    startDate: new Date(2026, 7, 20),
    createdAt: new Date(2026, 7, 21),
  },
  {
    // No startDate → createdAt fallback: starter in 2026-09, <6mo tenure,
    // unassigned service, unspecified employment type.
    role: "staff",
    serviceId: null,
    employmentType: null,
    startDate: null,
    createdAt: new Date(2026, 8, 1),
  },
  {
    // 6–12mo tenure (10 whole months on 2026-09-05), starter in 2025-10.
    role: "admin",
    serviceId: "svc-2",
    employmentType: "part_time",
    startDate: new Date(2025, 9, 10),
    createdAt: new Date(2025, 9, 10),
  },
];

const SERVICES = [
  { id: "svc-1", name: "Amana Auburn" },
  { id: "svc-2", name: "Amana Granville" },
];

const SEPARATIONS = [
  { lastWorkingDay: new Date(2026, 2, 15) },
  { lastWorkingDay: new Date(2026, 2, 20) },
];

const ENROLLMENTS = [
  { status: "completed" },
  { status: "completed" },
  { status: "in_progress" },
];

const CERTS = [
  { expiryDate: new Date(2026, 8, 1) }, // expired (-4 days)
  { expiryDate: new Date(2026, 8, 20) }, // within 30 (15 days)
  { expiryDate: new Date(2026, 9, 20) }, // within 60 (45 days)
  { expiryDate: new Date(2026, 10, 20) }, // within 90 (76 days)
  { expiryDate: new Date(2027, 4, 1) }, // beyond 90 — not counted
];

function seedMocks() {
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.user.findMany.mockResolvedValue(USERS);
  prismaMock.service.findMany.mockResolvedValue(SERVICES);
  prismaMock.separationRecord.findMany.mockResolvedValue(SEPARATIONS);
  prismaMock.lMSEnrollment.findMany.mockResolvedValue(ENROLLMENTS);
  prismaMock.complianceCertificate.findMany.mockResolvedValue(CERTS);
}

describe("GET /api/workforce-reports/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    seedMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without a session", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/workforce-reports/summary"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for staff role", async () => {
    mockSession({ id: "u-staff", name: "Staff", role: "staff" });
    const res = await GET(createRequest("GET", "/api/workforce-reports/summary"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for member role", async () => {
    mockSession({ id: "u-member", name: "Member", role: "member" });
    const res = await GET(createRequest("GET", "/api/workforce-reports/summary"));
    expect(res.status).toBe(403);
  });

  it("returns the summary for owner with correct headcounts", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    const res = await GET(createRequest("GET", "/api/workforce-reports/summary"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.activeStaff).toBe(4);

    // Role headcounts, sorted desc by count.
    expect(data.headcountByRole[0]).toMatchObject({
      key: "staff",
      label: "OSHC Educator",
      count: 2,
    });
    expect(data.headcountByRole).toHaveLength(3);

    // Service headcounts include an "Unassigned" bucket and resolve names.
    const svcMap = Object.fromEntries(
      data.headcountByService.map((s: { key: string; label: string; count: number }) => [
        s.key,
        s,
      ]),
    );
    expect(svcMap["svc-1"]).toMatchObject({ label: "Amana Auburn", count: 2 });
    expect(svcMap["svc-2"]).toMatchObject({ label: "Amana Granville", count: 1 });
    expect(svcMap["unassigned"]).toMatchObject({ label: "Unassigned", count: 1 });

    // Employment type includes the null → "unspecified" bucket.
    const typeMap = Object.fromEntries(
      data.headcountByEmploymentType.map(
        (t: { key: string; count: number }) => [t.key, t.count],
      ),
    );
    expect(typeMap).toEqual({
      permanent: 1,
      casual: 1,
      part_time: 1,
      unspecified: 1,
    });
  });

  it("buckets starters and leavers into the trailing 12 months", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    const res = await GET(createRequest("GET", "/api/workforce-reports/summary"));
    const data = await res.json();

    expect(data.months).toHaveLength(12);
    expect(data.months[0]).toBe("2025-10");
    expect(data.months[11]).toBe("2026-09");

    const starters = Object.fromEntries(
      data.startersByMonth.map((m: { month: string; count: number }) => [
        m.month,
        m.count,
      ]),
    );
    // u4 started 2025-10, u2 2026-08, u3 (createdAt fallback) 2026-09.
    // u1 started 2020 — outside the window.
    expect(starters["2025-10"]).toBe(1);
    expect(starters["2026-08"]).toBe(1);
    expect(starters["2026-09"]).toBe(1);
    const starterTotal = data.startersByMonth.reduce(
      (sum: number, m: { count: number }) => sum + m.count,
      0,
    );
    expect(starterTotal).toBe(3);

    const leavers = Object.fromEntries(
      data.leaversByMonth.map((m: { month: string; count: number }) => [
        m.month,
        m.count,
      ]),
    );
    expect(leavers["2026-03"]).toBe(2);
    const leaverTotal = data.leaversByMonth.reduce(
      (sum: number, m: { count: number }) => sum + m.count,
      0,
    );
    expect(leaverTotal).toBe(2);

    // Honesty split: 3 users had a recorded startDate, 1 fell back.
    expect(data.startBasis).toEqual({ withStartDate: 3, usingCreatedAt: 1 });
  });

  it("computes tenure buckets from startDate with createdAt fallback", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    const res = await GET(createRequest("GET", "/api/workforce-reports/summary"));
    const data = await res.json();

    const tenure = Object.fromEntries(
      data.tenure.map((t: { key: string; count: number }) => [t.key, t.count]),
    );
    expect(tenure).toEqual({
      "<6mo": 2, // u2 (0 months), u3 (0 months via createdAt)
      "6-12mo": 1, // u4 — 10 whole months
      "1-2y": 0,
      "2-5y": 0,
      "5y+": 1, // u1 — 79 whole months
    });
  });

  it("computes training completion and cert-expiry outlook", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    const res = await GET(createRequest("GET", "/api/workforce-reports/summary"));
    const data = await res.json();

    expect(data.training).toEqual({
      totalEssential: 3,
      completedEssential: 2,
      completionPct: 67,
    });

    expect(data.certOutlook).toEqual({
      expired: 1,
      within30: 1,
      within60: 1,
      within90: 1,
    });
  });

  it("returns null completion when there are no essential enrollments", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "owner" });
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
    const res = await GET(createRequest("GET", "/api/workforce-reports/summary"));
    const data = await res.json();
    expect(data.training).toEqual({
      totalEssential: 0,
      completedEssential: 0,
      completionPct: null,
    });
  });
});
