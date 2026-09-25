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
  withParentAuth: (handler: (...args: unknown[]) => unknown) => async (req: Request, routeContext?: unknown) => {
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

  describe("POST — comments are closed to parents", () => {
    // Changed 2026-08-04. A photo of one child with a comment thread
    // under it is a conversation every other family at the centre can
    // read, and there's no moderation behind it. Refused at the API, not
    // just hidden in the app — the endpoint is reachable regardless of
    // what the UI renders.
    it("403s regardless of the body", async () => {
      const res = await POST(
        createRequest("POST", "/api/parent/posts/p1/comments", {
          body: { content: "Lovely photo!" },
        }),
        { params: Promise.resolve({ postId: "p1" }) },
      );
      expect(res.status).toBe(403);
      expect(prismaMock.parentPostComment.create).not.toHaveBeenCalled();
    });

    it("403s for an empty body too — no validation path around it", async () => {
      const res = await POST(
        createRequest("POST", "/api/parent/posts/p1/comments", {
          body: {},
        }),
        { params: Promise.resolve({ postId: "p1" }) },
      );
      expect(res.status).toBe(403);
    });

    it("says what to do instead", async () => {
      const res = await POST(
        createRequest("POST", "/api/parent/posts/p1/comments", {
          body: { content: "hi" },
        }),
        { params: Promise.resolve({ postId: "p1" }) },
      );
      expect((await res.json()).error).toMatch(/head office/i);
    });
  });
});
