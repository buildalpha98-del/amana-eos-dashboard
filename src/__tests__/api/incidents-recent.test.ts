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

vi.mock("@/lib/centre-scope", () => ({
  getCentreScope: vi.fn(async () => ({ serviceIds: null })),
  applyCentreFilter: vi.fn((where: Record<string, unknown>, ids: string[]) => {
    where.serviceId = { in: ids };
  }),
}));

vi.mock("@/lib/service-scope", () => ({
  getStateScope: vi.fn(() => null),
}));

import { GET } from "@/app/api/incidents/recent/route";
import { getCentreScope } from "@/lib/centre-scope";
import { getStateScope } from "@/lib/service-scope";

const mockedGetCentreScope = vi.mocked(getCentreScope);
const mockedGetStateScope = vi.mocked(getStateScope);

function offsetDays(daysAgo: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

function makeIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: "inc-1",
    serviceId: "svc-1",
    service: { id: "svc-1", name: "Mawson Lakes", code: "ML" },
    incidentDate: offsetDays(1),
    childName: null,
    incidentType: "injury",
    severity: "minor",
    location: null,
    description: "Bumped knee on the playground.",
    actionTaken: null,
    parentNotified: false,
    reportableToAuthority: false,
    followUpRequired: false,
    deleted: false,
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
  // Default to admin scope (everything visible).
  mockedGetCentreScope.mockResolvedValue({ serviceIds: null });
  mockedGetStateScope.mockReturnValue(null);
}

describe("GET /api/incidents/recent", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/incidents/recent"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when limit is out of range", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/incidents/recent?limit=999"),
    );
    expect(res.status).toBe(400);
  });

  it("returns the empty list when there are no recent incidents", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.incidentRecord.findMany.mockResolvedValue([]);
    const res = await GET(
      createRequest("GET", "/api/incidents/recent"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.incidents).toEqual([]);
    expect(body.windowDays).toBe(14);
  });

  it("ranks reportable-to-authority above non-reportable serious + applies the limit", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.incidentRecord.findMany.mockResolvedValue([
      makeIncident({ id: "today-serious", severity: "serious", incidentDate: offsetDays(0) }),
      makeIncident({
        id: "yesterday-reportable-minor",
        severity: "minor",
        incidentDate: offsetDays(1),
        reportableToAuthority: true,
      }),
      makeIncident({ id: "old-minor", severity: "minor", incidentDate: offsetDays(7) }),
    ]);
    const res = await GET(
      createRequest("GET", "/api/incidents/recent?limit=2"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.incidents).toHaveLength(2);
    expect(body.incidents.map((i: { id: string }) => i.id)).toEqual([
      "yesterday-reportable-minor",
      "today-serious",
    ]);
  });

  it("applies the centre-scope filter when caller is centre-scoped", async () => {
    mockSession({ id: "u-1", name: "Director", role: "member", serviceId: "svc-1" });
    mockedGetCentreScope.mockResolvedValue({ serviceIds: ["svc-1"] });
    prismaMock.incidentRecord.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/incidents/recent"));
    const findManyCall =
      prismaMock.incidentRecord.findMany.mock.calls[0][0];
    expect(findManyCall.where.serviceId).toEqual({ in: ["svc-1"] });
  });

  it("applies the state-scope filter when caller is state-scoped", async () => {
    mockSession({ id: "ho-1", name: "HO", role: "head_office" });
    mockedGetStateScope.mockReturnValue("NSW");
    prismaMock.incidentRecord.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/incidents/recent"));
    const findManyCall =
      prismaMock.incidentRecord.findMany.mock.calls[0][0];
    expect(findManyCall.where.service).toEqual({ state: "NSW" });
  });

  it("filters out soft-deleted rows at the SQL boundary", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.incidentRecord.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/incidents/recent"));
    const findManyCall =
      prismaMock.incidentRecord.findMany.mock.calls[0][0];
    expect(findManyCall.where.deleted).toBe(false);
  });

  it("bounds incidentDate by the days lookback", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.incidentRecord.findMany.mockResolvedValue([]);
    await GET(createRequest("GET", "/api/incidents/recent?days=7"));
    const findManyCall =
      prismaMock.incidentRecord.findMany.mock.calls[0][0];
    const since = findManyCall.where.incidentDate.gte;
    expect(since).toBeInstanceOf(Date);
    const expectedFloor = new Date();
    expectedFloor.setUTCDate(expectedFloor.getUTCDate() - 7);
    // Within a few seconds of the expected floor.
    expect(Math.abs(since.getTime() - expectedFloor.getTime())).toBeLessThan(
      5_000,
    );
  });
});
