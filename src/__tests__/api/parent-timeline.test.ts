import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

// Mock parent-auth: intercept withParentAuth to inject parent payload
const mockParentPayload = { email: "parent@test.com", name: "Test Parent", enrolmentIds: ["enr-1"] };
let parentAuthEnabled = true;

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth: (handler: Function) => {
    return async (req: Request, routeContext?: unknown) => {
      if (!parentAuthEnabled) {
        const { NextResponse } = await import("next/server");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const ctx = { ...((routeContext as object) ?? {}), parent: mockParentPayload };
      return handler(req, ctx);
    };
  },
}));

import { GET } from "@/app/api/parent/timeline/route";

describe("GET /api/parent/timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parentAuthEnabled = true;
    mockParentPayload.enrolmentIds = ["enr-1"];
  });

  it("returns 401 when not authenticated", async () => {
    parentAuthEnabled = false;
    const req = createRequest("GET", "/api/parent/timeline");
    const res = await GET(req, undefined as never);
    expect(res.status).toBe(401);
  });

  it("returns empty items when parent has no enrolments", async () => {
    mockParentPayload.enrolmentIds = [];
    const req = createRequest("GET", "/api/parent/timeline");
    const res = await GET(req, undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  it("returns empty items when enrolments have no services", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: null, childRecords: [] },
    ]);
    const req = createRequest("GET", "/api/parent/timeline");
    const res = await GET(req, undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  it("scopes posts to the parent's services only", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "svc-1", childRecords: [{ id: "child-1" }] },
    ]);
    prismaMock.parentPost.findMany.mockResolvedValue([]);
    prismaMock.centreContact.findMany.mockResolvedValue([]);
    prismaMock.parentPostLike.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/parent/timeline");
    const res = await GET(req, undefined as never);
    expect(res.status).toBe(200);

    // Verify the query included a serviceId filter
    const call = prismaMock.parentPost.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toEqual({ in: ["svc-1"] });
  });

  it("returns community and child-tagged posts", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "svc-1", childRecords: [{ id: "child-1" }] },
    ]);
    prismaMock.parentPost.findMany.mockResolvedValue([
      {
        id: "p-1",
        title: "Community Announcement",
        content: "Hello all",
        isCommunity: true,
        type: "announcement",
        tags: [],
        author: { id: "u-1", name: "Staff", image: null },
        createdAt: new Date().toISOString(),
        _count: { likes: 3, comments: 1 },
      },
      {
        id: "p-2",
        title: "Observation",
        content: "Great day",
        isCommunity: false,
        type: "observation",
        tags: [{ id: "t-1", child: { id: "child-1", firstName: "Sam", surname: "J" } }],
        author: { id: "u-1", name: "Staff", image: null },
        createdAt: new Date().toISOString(),
        _count: { likes: 0, comments: 0 },
      },
    ]);
    prismaMock.centreContact.findMany.mockResolvedValue([{ id: "cc-1", serviceId: "svc-1" }]);
    prismaMock.parentPostLike.findMany.mockResolvedValue([{ postId: "p-1" }]);

    const req = createRequest("GET", "/api/parent/timeline");
    const res = await GET(req, undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      likeCount: 3,
      commentCount: 1,
      likedByMe: true,
    });
    expect(body.items[1]).toMatchObject({
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
    });
  });
});
