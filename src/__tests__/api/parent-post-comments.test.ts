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
        return NextResponse.json(
          { error: err.message, details: err.details },
          { status: err.status },
        );
      }
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
  },
}));

import { GET, POST } from "@/app/api/parent/posts/[postId]/comments/route";

describe("/api/parent/posts/[postId]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parentAuthEnabled = true;
    mockParentPayload.enrolmentIds = ["enr-1"];
  });

  const ctx = { params: Promise.resolve({ postId: "p1" }) } as never;

  describe("GET", () => {
    it("401 when unauthenticated", async () => {
      parentAuthEnabled = false;
      const res = await GET(createRequest("GET", "/api/parent/posts/p1/comments"), ctx);
      expect(res.status).toBe(401);
    });

    it("404 when post not found", async () => {
      prismaMock.parentPost.findUnique.mockResolvedValue(null);
      const res = await GET(createRequest("GET", "/api/parent/posts/p1/comments"), ctx);
      expect(res.status).toBe(404);
    });

    it("returns paginated + shortened author names", async () => {
      prismaMock.parentPost.findUnique.mockResolvedValue({
        id: "p1",
        serviceId: "s1",
        isCommunity: true,
        tags: [],
      });
      prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
        { serviceId: "s1", childRecords: [] },
      ]);
      prismaMock.parentPostComment.findMany.mockResolvedValue([
        {
          id: "c1",
          body: "Hello",
          createdAt: new Date("2026-01-01"),
          parentAuthor: { firstName: "Jayden", lastName: "Kowaider" },
          staffAuthor: null,
        },
        {
          id: "c2",
          body: "Hi",
          createdAt: new Date("2026-01-02"),
          parentAuthor: null,
          staffAuthor: { name: "Sarah Smith" },
        },
      ]);
      const res = await GET(createRequest("GET", "/api/parent/posts/p1/comments"), ctx);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      expect(body.items[0]).toMatchObject({
        id: "c1",
        body: "Hello",
        authorName: "Jayden K.",
        authorType: "parent",
      });
      expect(body.items[1]).toMatchObject({
        id: "c2",
        authorName: "Sarah S.",
        authorType: "staff",
      });
    });
  });

  describe("POST", () => {
    it("400 when body missing", async () => {
      prismaMock.parentPost.findUnique.mockResolvedValue({
        id: "p1",
        serviceId: "s1",
        isCommunity: true,
        tags: [],
      });
      prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
        { serviceId: "s1", childRecords: [] },
      ]);
      prismaMock.centreContact.findFirst.mockResolvedValue({ id: "cc1" });
      const res = await POST(
        createRequest("POST", "/api/parent/posts/p1/comments", { body: { body: "" } }),
        ctx,
      );
      expect(res.status).toBe(400);
    });

    it("400 when body exceeds 2000 chars", async () => {
      prismaMock.parentPost.findUnique.mockResolvedValue({
        id: "p1",
        serviceId: "s1",
        isCommunity: true,
        tags: [],
      });
      prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
        { serviceId: "s1", childRecords: [] },
      ]);
      prismaMock.centreContact.findFirst.mockResolvedValue({ id: "cc1" });
      const res = await POST(
        createRequest("POST", "/api/parent/posts/p1/comments", {
          body: { body: "x".repeat(2001) },
        }),
        ctx,
      );
      expect(res.status).toBe(400);
    });

    it("201 creates a parent comment", async () => {
      prismaMock.parentPost.findUnique.mockResolvedValue({
        id: "p1",
        serviceId: "s1",
        isCommunity: true,
        tags: [],
      });
      prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
        { serviceId: "s1", childRecords: [] },
      ]);
      prismaMock.centreContact.findFirst.mockResolvedValue({ id: "cc1" });
      prismaMock.parentPostComment.create.mockResolvedValue({
        id: "c-new",
        body: "Thanks for sharing",
        createdAt: new Date("2026-04-23T10:00:00Z"),
        parentAuthor: { firstName: "Jayden", lastName: "Kowaider" },
        staffAuthor: null,
      });
      const res = await POST(
        createRequest("POST", "/api/parent/posts/p1/comments", {
          body: { body: "Thanks for sharing" },
        }),
        ctx,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({
        id: "c-new",
        body: "Thanks for sharing",
        authorName: "Jayden K.",
        authorType: "parent",
      });
      expect(prismaMock.parentPostComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { postId: "p1", parentAuthorId: "cc1", body: "Thanks for sharing" },
        }),
      );
    });

    it("403 when no CentreContact for service", async () => {
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
      const res = await POST(
        createRequest("POST", "/api/parent/posts/p1/comments", { body: { body: "hi" } }),
        ctx,
      );
      expect(res.status).toBe(403);
    });
  });
});
