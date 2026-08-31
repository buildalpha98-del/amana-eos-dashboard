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
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { GET } from "@/app/api/marketing/creative-request-quality/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function mockActiveUsers() {
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      const id = args?.where?.id;
      if (id === "mkt-1") return { id, role: "marketing", active: true } as never;
      if (id === "member-1") return { id, role: "member", active: true } as never;
      return null;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  mockActiveUsers();
});

describe("GET /api/marketing/creative-request-quality", () => {
  it("returns 401 with no session", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/marketing/creative-request-quality"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member (centre roles can't see quality analytics)", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    const res = await GET(
      createRequest("GET", "/api/marketing/creative-request-quality"),
    );
    expect(res.status).toBe(403);
  });

  it("windows both queries on ?days (satisfaction createdAt, v1 proofs decidedAt)", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequestSatisfaction.findMany.mockResolvedValue([]);
    prismaMock.creativeRequestProof.findMany.mockResolvedValue([]);

    const before = Date.now();
    const res = await GET(
      createRequest("GET", "/api/marketing/creative-request-quality?days=30"),
    );
    expect(res.status).toBe(200);

    const satArgs =
      prismaMock.creativeRequestSatisfaction.findMany.mock.calls[0][0];
    const satSince: Date = satArgs.where.createdAt.gte;
    expect(satSince).toBeInstanceOf(Date);
    // ~30 days back (tolerate test runtime skew)
    expect(before - satSince.getTime()).toBeGreaterThan(29.9 * 86400000);
    expect(before - satSince.getTime()).toBeLessThan(30.1 * 86400000);

    const proofArgs = prismaMock.creativeRequestProof.findMany.mock.calls[0][0];
    expect(proofArgs.where.version).toBe(1);
    expect(proofArgs.where.decision).toEqual({ not: null });
    expect(proofArgs.where.decidedAt.gte).toBeInstanceOf(Date);
  });

  it("folds CSAT + first-proof maths; approved_with_changes counts in the denominator only", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequestSatisfaction.findMany.mockResolvedValue([
      { positive: true, request: { type: "poster" } },
      { positive: true, request: { type: "poster" } },
      { positive: false, request: { type: "poster" } },
      { positive: true, request: { type: "flyer" } },
    ] as never);
    prismaMock.creativeRequestProof.findMany.mockResolvedValue([
      { decision: "approved", request: { type: "poster" } },
      // approves the request, but the FIRST proof still needed fixes —
      // must land in decided, not approved
      { decision: "approved_with_changes", request: { type: "poster" } },
      { decision: "changes_requested", request: { type: "flyer" } },
      { decision: "approved", request: { type: "flyer" } },
    ] as never);

    const res = await GET(
      createRequest("GET", "/api/marketing/creative-request-quality"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.csat).toEqual({ positive: 3, negative: 1, rate: 0.75 });
    expect(body.firstProof).toEqual({ approved: 2, decided: 4, rate: 0.5 });

    const poster = body.byType.find(
      (t: { type: string }) => t.type === "poster",
    );
    expect(poster).toMatchObject({
      csatCount: 3,
      csatRate: 2 / 3,
      decidedCount: 2,
      firstProofRate: 0.5, // approved_with_changes excluded from the numerator
    });
    const flyer = body.byType.find((t: { type: string }) => t.type === "flyer");
    expect(flyer).toMatchObject({
      csatCount: 1,
      csatRate: 1,
      decidedCount: 2,
      firstProofRate: 0.5,
    });
  });

  it("returns null rates (not NaN/0) when there is no data", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequestSatisfaction.findMany.mockResolvedValue([]);
    prismaMock.creativeRequestProof.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", "/api/marketing/creative-request-quality"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.csat).toEqual({ positive: 0, negative: 0, rate: null });
    expect(body.firstProof).toEqual({ approved: 0, decided: 0, rate: null });
    expect(body.byType).toEqual([]);
  });

  it("handles a type with ratings but no decided v1 proofs (null firstProofRate)", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequestSatisfaction.findMany.mockResolvedValue([
      { positive: false, request: { type: "merch" } },
    ] as never);
    prismaMock.creativeRequestProof.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", "/api/marketing/creative-request-quality"),
    );
    const body = await res.json();
    const merch = body.byType.find((t: { type: string }) => t.type === "merch");
    expect(merch).toMatchObject({
      csatCount: 1,
      csatRate: 0,
      decidedCount: 0,
      firstProofRate: null,
    });
  });
});
