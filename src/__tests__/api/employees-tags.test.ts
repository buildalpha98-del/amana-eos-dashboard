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
}));

import { GET } from "@/app/api/employees/tags/route";
import { getCentreScope } from "@/lib/centre-scope";
const mockedGetCentreScope = vi.mocked(getCentreScope);

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  mockedGetCentreScope.mockResolvedValue({ serviceIds: null });
});

describe("GET /api/employees/tags", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/employees/tags"));
    expect(res.status).toBe(401);
  });

  it("returns a deduped + alphabetically sorted distinct list", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([
      { tags: ["nsw", "lead"] },
      { tags: ["lead", "weekend-only"] },
      { tags: ["nsw"] },
      { tags: [] },
    ]);
    const res = await GET(createRequest("GET", "/api/employees/tags"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tags).toEqual(["lead", "nsw", "weekend-only"]);
  });

  it("returns an empty array when no users have tags", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([
      { tags: [] },
      { tags: [] },
    ]);
    const res = await GET(createRequest("GET", "/api/employees/tags"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tags: [] });
  });

  it("scopes to caller's service ids for centre-scoped roles", async () => {
    mockSession({ id: "m-1", name: "Member", role: "member" });
    mockedGetCentreScope.mockResolvedValue({ serviceIds: ["svc-1"] });
    prismaMock.user.findMany.mockResolvedValue([{ tags: ["nsw"] }]);
    await GET(createRequest("GET", "/api/employees/tags"));
    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyCall.where.serviceId).toEqual({ in: ["svc-1"] });
  });

  it("returns 403 for centre-scoped role with no service assigned", async () => {
    mockSession({ id: "m-2", name: "Stray", role: "member" });
    mockedGetCentreScope.mockResolvedValue({ serviceIds: [] });
    const res = await GET(createRequest("GET", "/api/employees/tags"));
    expect(res.status).toBe(403);
  });

  it("marketing viewer gets org-wide tags (NOT scoped)", async () => {
    mockSession({ id: "mk-1", name: "Marketing", role: "marketing" });
    mockedGetCentreScope.mockResolvedValue({ serviceIds: ["svc-mk"] });
    prismaMock.user.findMany.mockResolvedValue([
      { tags: ["nsw", "vic"] },
    ]);
    await GET(createRequest("GET", "/api/employees/tags"));
    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyCall.where).toEqual({});
  });
});
