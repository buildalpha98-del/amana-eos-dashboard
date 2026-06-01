/**
 * Auth + format tests for /api/wgea-report.
 *
 * Critical contract:
 *   - admin-only
 *   - CSV format triggers attachment headers + text/csv content-type
 *   - anonymise=true (default) means name is null in JSON rows
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

import { GET } from "@/app/api/wgea-report/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({
    active: true,
    serviceId: "svc-1",
  });
});

const mockUsers = [
  {
    id: "u-1",
    name: "Test Staff One",
    role: "staff",
    startDate: new Date("2024-01-01"),
    service: { name: "Riverside OSHC" },
    diversityProfile: { genderIdentity: "woman" },
    contracts: [
      { contractType: "ct_permanent", payRate: 35, hoursPerWeek: 38 },
    ],
  },
  {
    id: "u-2",
    name: "Test Staff Two",
    role: "admin",
    startDate: new Date("2022-06-15"),
    service: { name: "Riverside OSHC" },
    diversityProfile: null,
    contracts: [],
  },
];

describe("GET /api/wgea-report — auth + format", () => {
  it("rejects unauthenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/wgea-report"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
  });

  it("rejects staff", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await GET(
      createRequest("GET", "/api/wgea-report"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("admin gets JSON by default, names null when anonymised", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue(mockUsers);
    const res = await GET(
      createRequest("GET", "/api/wgea-report"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(2);
    // anonymise=true is the default — names must NOT leak
    for (const r of body.rows) {
      expect(r.name).toBeNull();
      // staffId should be a hash (12 hex chars), not the raw id
      expect(r.staffId).toMatch(/^[a-f0-9]{12}$/);
    }
  });

  it("admin can opt OUT of anonymisation explicitly", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue(mockUsers);
    const res = await GET(
      createRequest("GET", "/api/wgea-report?anonymise=false"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows[0].name).toBe("Test Staff One");
    expect(body.rows[0].staffId).toBe("u-1");
  });

  it("format=csv returns attachment headers", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue(mockUsers);
    const res = await GET(
      createRequest("GET", "/api/wgea-report?format=csv"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const text = await res.text();
    // CSV header row should include the WGEA-required columns
    expect(text).toContain("Manager category");
    expect(text).toContain("Annualised base salary");
  });

  it("includeInactive=true relaxes the active filter", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    await GET(
      createRequest("GET", "/api/wgea-report?includeInactive=true"),
      { params: Promise.resolve({}) },
    );
    const call = prismaMock.user.findMany.mock.calls[0]?.[0];
    expect(call?.where).not.toHaveProperty("active");
  });
});
