import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
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
import { GET } from "@/app/api/team/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const USER_SAMPLE = [
  {
    id: "u1",
    name: "Jane Doe",
    email: "jane@example.com",
    role: "admin",
    avatar: null,
    service: { id: "svc-1", name: "Parramatta" },
    _count: {
      ownedRocks: 2,
      assignedTodos: 5,
      ownedIssues: 1,
      managedServices: 0,
    },
  },
  {
    id: "u2",
    name: "Mark Smith",
    email: "mark@example.com",
    role: "staff",
    avatar: null,
    service: null,
    _count: {
      ownedRocks: 0,
      assignedTodos: 0,
      ownedIssues: 0,
      managedServices: 0,
    },
  },
];

describe("GET /api/team", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.user.findMany.mockResolvedValue(USER_SAMPLE);
    prismaMock.todo.groupBy.mockResolvedValue([]);
    prismaMock.rock.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(USER_SAMPLE.length);
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/team");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns full team for authenticated staff user", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const req = createRequest("GET", "/api/team");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].service).toEqual({ id: "svc-1", name: "Parramatta" });
    expect(body[1].service).toBeNull();
  });

  it("empty filters returns all active users", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest("GET", "/api/team");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ active: true });
  });

  it("?service= filter is applied to the where clause", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest("GET", "/api/team?service=svc-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-1");
  });

  it("?role= filter is applied when the role is valid", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest("GET", "/api/team?role=coordinator");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.where.role).toBe("coordinator");
  });

  it("?role= is ignored when value is not a valid Role", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest("GET", "/api/team?role=hacker");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.where.role).toBeUndefined();
  });

  it("?q= filter is applied as case-insensitive name contains", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest("GET", "/api/team?q=jan");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.where.name).toEqual({ contains: "jan", mode: "insensitive" });
  });

  it("combines multiple filters", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest(
      "GET",
      "/api/team?service=svc-1&role=staff&q=jane",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-1");
    expect(call.where.role).toBe("staff");
    expect(call.where.name).toEqual({ contains: "jane", mode: "insensitive" });
  });

  it("selects service relation with id and name", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = createRequest("GET", "/api/team");
    await GET(req);
    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.select.service).toEqual({
      select: { id: true, name: true },
    });
  });
});
