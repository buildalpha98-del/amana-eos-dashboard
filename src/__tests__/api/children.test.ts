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

// Import AFTER mocks.
import { GET } from "@/app/api/children/route";

function makeChild(overrides: Record<string, unknown> = {}) {
  return {
    id: "child-1",
    enrolmentId: "enr-1",
    serviceId: "svc-1",
    firstName: "Alice",
    surname: "Smith",
    dob: null,
    status: "active",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    enrolment: {
      id: "enr-1",
      primaryParent: {
        firstName: "Priya",
        surname: "Smith",
        email: "priya@example.com",
        mobile: "+61400000001",
        relationship: "Mother",
      },
      secondaryParent: null,
      status: "submitted",
      createdAt: new Date("2026-01-01"),
    },
    service: { id: "svc-1", name: "Alpha", code: "A" },
    ...overrides,
  };
}

describe("GET /api/children — basic auth + existing behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/children"));
    expect(res.status).toBe(401);
  });

  it("returns children array + total for authenticated user", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([makeChild()]);
    prismaMock.child.count.mockResolvedValue(1);

    const res = await GET(createRequest("GET", "/api/children"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.total).toBe(1);
    expect(Array.isArray(body.children)).toBe(true);
    expect(body.children[0].id).toBe("child-1");
    // Without includeParents=true, we should NOT hydrate the parents array
    expect(body.children[0].parents).toBeUndefined();
  });
});

describe("GET /api/children — new filter params", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("?serviceId=x filters where.serviceId", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);

    const res = await GET(
      createRequest("GET", "/api/children?serviceId=svc-42"),
    );
    expect(res.status).toBe(200);

    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-42");
  });

  it("?status=current maps to status in (active, pending) — widened 2026-04-29", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);

    const res = await GET(
      createRequest("GET", "/api/children?status=current"),
    );
    expect(res.status).toBe(200);

    const call = prismaMock.child.findMany.mock.calls[0][0];
    // Pre-2026-04-29 this was status="active" only, which hid newly-approved
    // enrolments still sitting at "pending". Widened so Centre Directors
    // see kids who are attending OR awaiting enrolment processing.
    expect(call.where.status).toEqual({ in: ["active", "pending"] });
  });

  it("?status=all does NOT set where.status", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);

    const res = await GET(createRequest("GET", "/api/children?status=all"));
    expect(res.status).toBe(200);

    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
  });

  it("?status=withdrawn sets where.status=withdrawn", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);

    await GET(createRequest("GET", "/api/children?status=withdrawn"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.status).toBe("withdrawn");
  });

  it("?sortBy=surname orders by surname asc", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);

    await GET(createRequest("GET", "/api/children?sortBy=surname"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ surname: "asc" });
  });

  it("?sortBy=firstName orders by firstName asc", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);

    await GET(createRequest("GET", "/api/children?sortBy=firstName"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ firstName: "asc" });
  });

  it("unknown sortBy falls back to createdAt desc", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);

    await GET(createRequest("GET", "/api/children?sortBy=garbage"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ createdAt: "desc" });
  });

  it("?room=Sunshine filters on Child.room (4b — dropped ownaRoomName fallback)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);

    await GET(createRequest("GET", "/api/children?room=Sunshine"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.room).toBe("Sunshine");
    expect(call.where.ownaRoomName).toBeUndefined();
  });

  it("?ccsStatus + ?tags are forwarded to SQL (4b — previously no-op)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);

    const res = await GET(
      createRequest(
        "GET",
        "/api/children?ccsStatus=eligible&tags=special&tags=priority",
      ),
    );
    expect(res.status).toBe(200);

    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.ccsStatus).toBe("eligible");
    expect(call.where.tags).toEqual({ hasSome: ["special", "priority"] });
  });
});

describe("GET /api/children — includeParents=true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("hydrates parents array with primary parent flagged", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([
      makeChild({
        enrolment: {
          id: "enr-1",
          primaryParent: {
            firstName: "Priya",
            surname: "Smith",
            email: "priya@example.com",
            mobile: "+61400000001",
            relationship: "Mother",
          },
          secondaryParent: {
            firstName: "Sam",
            surname: "Smith",
            email: "sam@example.com",
            mobile: "+61400000002",
            relationship: "Father",
          },
          status: "submitted",
          createdAt: new Date("2026-01-01"),
        },
      }),
    ]);
    prismaMock.child.count.mockResolvedValue(1);

    const res = await GET(
      createRequest("GET", "/api/children?includeParents=true"),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.children[0].parents).toHaveLength(2);
    expect(body.children[0].parents[0]).toMatchObject({
      firstName: "Priya",
      surname: "Smith",
      isPrimary: true,
      email: "priya@example.com",
      phone: "+61400000001",
      relationship: "Mother",
    });
    expect(body.children[0].parents[1]).toMatchObject({
      firstName: "Sam",
      surname: "Smith",
      isPrimary: false,
    });
  });

  it("silently drops parent entries that fail schema parsing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([
      makeChild({
        enrolment: {
          id: "enr-1",
          primaryParent: {
            firstName: "Priya",
            surname: "Smith",
            email: "priya@example.com",
          },
          // Malformed — surname missing, should be dropped.
          secondaryParent: { firstName: "Broken" },
          status: "submitted",
          createdAt: new Date("2026-01-01"),
        },
      }),
    ]);
    prismaMock.child.count.mockResolvedValue(1);

    const res = await GET(
      createRequest("GET", "/api/children?includeParents=true"),
    );
    const body = await res.json();
    expect(body.children[0].parents).toHaveLength(1);
    expect(body.children[0].parents[0].firstName).toBe("Priya");
  });

  it("does not crash when enrolment is null", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([
      makeChild({ enrolment: null }),
    ]);
    prismaMock.child.count.mockResolvedValue(1);

    const res = await GET(
      createRequest("GET", "/api/children?includeParents=true"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.children[0].parents).toEqual([]);
  });
});
