import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
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

import { GET } from "@/app/api/scorecard/route";
import { getServiceScope } from "@/lib/service-scope";

describe("GET /api/scorecard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/scorecard"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when no scorecard exists", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.scorecard.findFirst.mockResolvedValue(null);

    const res = await GET(createRequest("GET", "/api/scorecard"));
    expect(res.status).toBe(404);
  });

  it("returns scorecard with measurables for owner (no scope narrowing)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.scorecard.findFirst.mockResolvedValue({
      id: "sc1",
      measurables: [],
    });

    const res = await GET(createRequest("GET", "/api/scorecard"));
    expect(res.status).toBe(200);

    const call = prismaMock.scorecard.findFirst.mock.calls[0][0];
    // Owner: measurableWhere is undefined (no narrowing)
    expect(call.include.measurables.where).toBeUndefined();
  });
});

// ── 4b scope-widening regression (high-risk narrow route) ──
describe("GET /api/scorecard — 4b scope audit regression (narrow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("coordinator measurables.where is narrowed to own service", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "coordinator",
      serviceId: "svc1",
    });
    vi.mocked(getServiceScope).mockReturnValue("svc1");

    prismaMock.scorecard.findFirst.mockResolvedValue({
      id: "sc1",
      measurables: [],
    });

    const res = await GET(createRequest("GET", "/api/scorecard"));
    expect(res.status).toBe(200);

    const call = prismaMock.scorecard.findFirst.mock.calls[0][0];
    expect(call.include.measurables.where).toEqual({ serviceId: "svc1" });
  });

  it("marketing measurables.where is narrowed to own service", async () => {
    mockSession({
      id: "mkt-1",
      name: "Marketing",
      role: "marketing",
      serviceId: "svc1",
    });
    vi.mocked(getServiceScope).mockReturnValue("svc1");

    prismaMock.scorecard.findFirst.mockResolvedValue({
      id: "sc1",
      measurables: [],
    });

    const res = await GET(createRequest("GET", "/api/scorecard"));
    expect(res.status).toBe(200);

    const call = prismaMock.scorecard.findFirst.mock.calls[0][0];
    expect(call.include.measurables.where).toEqual({ serviceId: "svc1" });
  });
});
