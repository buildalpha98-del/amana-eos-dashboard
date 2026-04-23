import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

const mockParentPayload = {
  email: "jayden@example.com",
  name: "Jayden",
  enrolmentIds: ["enr-1"],
};
let parentAuthEnabled = true;

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth: (handler: Function) => async (req: Request, routeContext?: unknown) => {
    const { NextResponse } = await import("next/server");
    if (!parentAuthEnabled) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ctx = { ...((routeContext as object) ?? {}), parent: mockParentPayload };
    try {
      return await handler(req, ctx);
    } catch (err: any) {
      if (err && typeof err.status === "number") {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
  },
}));

import { POST, DELETE } from "@/app/api/parent/posts/[postId]/like/route";

describe("POST/DELETE /api/parent/posts/[postId]/like", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parentAuthEnabled = true;
    mockParentPayload.enrolmentIds = ["enr-1"];
  });

  const ctx = { params: Promise.resolve({ postId: "p1" }) } as never;

  it("401 when not authenticated", async () => {
    parentAuthEnabled = false;
    const req = createRequest("POST", "/api/parent/posts/p1/like");
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it("404 when post not found", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue(null);
    const req = createRequest("POST", "/api/parent/posts/p1/like");
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it("403 when parent has no access to the post", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "other",
      isCommunity: true,
      tags: [],
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "s1", childRecords: [] },
    ]);
    const req = createRequest("POST", "/api/parent/posts/p1/like");
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it("403 when no CentreContact for post's service", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "s1",
      isCommunity: true,
      tags: [],
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "s1", childRecords: [] },
    ]);
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    const req = createRequest("POST", "/api/parent/posts/p1/like");
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it("POST creates like and returns liked:true + count", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "s1",
      isCommunity: true,
      tags: [],
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "s1", childRecords: [] },
    ]);
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "cc1", serviceId: "s1" });
    prismaMock.parentPostLike.upsert.mockResolvedValue({ id: "l1" });
    prismaMock.parentPostLike.count.mockResolvedValue(7);

    const req = createRequest("POST", "/api/parent/posts/p1/like");
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ liked: true, likeCount: 7 });
    expect(prismaMock.parentPostLike.upsert).toHaveBeenCalledWith({
      where: { postId_likerId: { postId: "p1", likerId: "cc1" } },
      create: { postId: "p1", likerId: "cc1" },
      update: {},
    });
  });

  it("POST is idempotent — still returns 200 when already liked", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "s1",
      isCommunity: true,
      tags: [],
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "s1", childRecords: [] },
    ]);
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "cc1", serviceId: "s1" });
    prismaMock.parentPostLike.upsert.mockResolvedValue({ id: "l1" });
    prismaMock.parentPostLike.count.mockResolvedValue(7);
    const req = createRequest("POST", "/api/parent/posts/p1/like");
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
  });

  it("DELETE removes like and returns liked:false + count", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "s1",
      isCommunity: true,
      tags: [],
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "s1", childRecords: [] },
    ]);
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "cc1", serviceId: "s1" });
    prismaMock.parentPostLike.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.parentPostLike.count.mockResolvedValue(6);

    const req = createRequest("DELETE", "/api/parent/posts/p1/like");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ liked: false, likeCount: 6 });
  });
});
