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
  applyCentreFilter: vi.fn(),
}));

import { GET } from "@/app/api/employees/route";
import { getCentreScope } from "@/lib/centre-scope";

const mockedGetCentreScope = vi.mocked(getCentreScope);

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    name: "Alice Adams",
    email: "alice@example.com",
    avatar: null,
    phone: "0400000001",
    role: "staff",
    active: true,
    lastLoginAt: new Date("2026-04-01"),
    tags: [] as string[],
    service: { id: "svc-1", name: "Mawson Lakes" },
    ...overrides,
  };
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    return Promise.resolve({ active: true });
  });
  mockedGetCentreScope.mockResolvedValue({ serviceIds: null });
});

describe("GET /api/employees", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/employees"));
    expect(res.status).toBe(401);
  });

  it("returns paginated list for admin viewer", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([makeUser()]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await GET(createRequest("GET", "/api/employees"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.employees).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
  });

  it("strips PII for marketing viewer", async () => {
    mockSession({ id: "m-1", name: "Marketing", role: "marketing" });
    prismaMock.user.findMany.mockResolvedValue([makeUser()]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await GET(createRequest("GET", "/api/employees"));
    const body = await res.json();
    expect(body.employees[0].email).toBe(null);
    expect(body.employees[0].phone).toBe(null);
    expect(body.employees[0].name).toBe("Alice Adams");
  });

  it("marketing viewer gets cross-service visibility (NOT scoped to own service)", async () => {
    // The default getCentreScope behavior would scope marketing to their
    // own serviceId. The route bypasses that — confirm the WHERE clause
    // has NO serviceId filter for marketing role.
    mockSession({
      id: "m-1",
      name: "Marketing",
      role: "marketing",
      serviceId: "svc-1",
    });
    // Even though getCentreScope would return ["svc-1"], the route
    // ignores it for marketing.
    mockedGetCentreScope.mockResolvedValue({ serviceIds: ["svc-1"] });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    await GET(createRequest("GET", "/api/employees"));
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toBeUndefined();
  });

  it("applies centre-scope filter when caller is scoped", async () => {
    mockSession({
      id: "u-1",
      name: "Director",
      role: "member",
      serviceId: "svc-1",
    });
    mockedGetCentreScope.mockResolvedValue({ serviceIds: ["svc-1"] });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    await GET(createRequest("GET", "/api/employees"));
    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyCall.where.serviceId).toEqual({ in: ["svc-1"] });
  });

  it("returns pendingCount for admin viewers (drives the bulk-resend button)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    // Three separate user.count calls now: list total + pendingCount.
    // mockImplementation routes by `where` shape.
    prismaMock.user.count.mockImplementation(async (args: unknown) => {
      const a = args as { where?: { lastLoginAt?: null | undefined } };
      if (a?.where?.lastLoginAt === null) return 7; // pending
      return 12; // total
    });
    const res = await GET(createRequest("GET", "/api/employees"));
    const body = await res.json();
    expect(body.total).toBe(12);
    expect(body.pendingCount).toBe(7);
  });

  it("pendingCount is 0 for non-admin viewers (member)", async () => {
    mockSession({
      id: "m-1",
      name: "Member",
      role: "member",
      serviceId: "svc-1",
    });
    mockedGetCentreScope.mockResolvedValue({ serviceIds: ["svc-1"] });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(3);
    const res = await GET(createRequest("GET", "/api/employees"));
    const body = await res.json();
    expect(body.pendingCount).toBe(0);
  });

  it("filters by tag with AND semantics (hasEvery) and normalises input case", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    await GET(createRequest("GET", "/api/employees?tag=NSW,Lead"));
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.tags).toEqual({ hasEvery: ["nsw", "lead"] });
  });

  it("silently drops tag values that fail normalisation", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    // Reject emoji + accent + empty; keep "nsw" and "lead".
    await GET(
      createRequest(
        "GET",
        "/api/employees?tag=nsw,%F0%9F%9A%80,Caf%C3%A9,,lead",
      ),
    );
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.tags).toEqual({ hasEvery: ["nsw", "lead"] });
  });

  it("returns 400 on invalid sort", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/employees?sort=password"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on out-of-range pageSize", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/employees?pageSize=999"),
    );
    expect(res.status).toBe(400);
  });

  it("hides deactivated rows by default; surfaces them when status=deactivated", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    // Default: active=true filter
    await GET(createRequest("GET", "/api/employees"));
    let where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);

    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    // status=deactivated: active=false filter
    await GET(
      createRequest("GET", "/api/employees?status=deactivated"),
    );
    where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(false);
  });

  it("paginates correctly with page=2 pageSize=25", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(60);
    const res = await GET(
      createRequest("GET", "/api/employees?page=2&pageSize=25"),
    );
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(25);
    expect(body.totalPages).toBe(3);
    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyCall.skip).toBe(25);
    expect(findManyCall.take).toBe(25);
  });

  it("applies search filter across name + email", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    await GET(createRequest("GET", "/api/employees?q=ali"));
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: "ali", mode: "insensitive" } },
      { email: { contains: "ali", mode: "insensitive" } },
    ]);
  });

  it("returns 403 for staff viewer who hasn't been service-scoped (defensive)", async () => {
    // staff role with no serviceId / no scope returned: forbidden.
    mockSession({ id: "u-1", name: "Staff", role: "staff", serviceId: null });
    mockedGetCentreScope.mockResolvedValue({ serviceIds: [] });
    const res = await GET(createRequest("GET", "/api/employees"));
    expect(res.status).toBe(403);
  });
});
