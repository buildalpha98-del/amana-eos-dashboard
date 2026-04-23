import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
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

import { POST } from "@/app/api/services/[id]/parent-posts/[postId]/comments/route";
import { DELETE } from "@/app/api/services/[id]/parent-posts/[postId]/comments/[commentId]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const SERVICE_ID = "svc-1";
const POST_ID = "post-1";
const COMMENT_ID = "comment-1";

describe("POST /api/services/[id]/parent-posts/[postId]/comments (staff reply)", () => {
  const context = {
    params: Promise.resolve({ id: SERVICE_ID, postId: POST_ID }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments`, {
      body: { body: "hi" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(401);
  });

  it("403 when role is not allowed (e.g. member)", async () => {
    mockSession({ id: "u1", name: "X", role: "member", serviceId: SERVICE_ID });
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments`, {
      body: { body: "hi" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(403);
  });

  it("403 when coordinator does not belong to service", async () => {
    mockSession({ id: "u1", name: "X", role: "coordinator", serviceId: "svc-other" });
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments`, {
      body: { body: "hi" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(403);
  });

  it("404 when post does not exist", async () => {
    mockSession({ id: "u1", name: "X", role: "admin", serviceId: SERVICE_ID });
    prismaMock.parentPost.findUnique.mockResolvedValue(null);
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments`, {
      body: { body: "hi" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(404);
  });

  it("404 when post belongs to another service", async () => {
    mockSession({ id: "u1", name: "X", role: "admin", serviceId: SERVICE_ID });
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: POST_ID,
      serviceId: "svc-other",
    });
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments`, {
      body: { body: "hi" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(404);
  });

  it("400 when body empty", async () => {
    mockSession({ id: "u1", name: "X", role: "admin", serviceId: SERVICE_ID });
    prismaMock.parentPost.findUnique.mockResolvedValue({ id: POST_ID, serviceId: SERVICE_ID });
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments`, {
      body: { body: "" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(400);
  });

  it("201 creates staff comment with author name shortened", async () => {
    mockSession({ id: "u1", name: "Sarah Smith", role: "admin", serviceId: SERVICE_ID });
    prismaMock.parentPost.findUnique.mockResolvedValue({ id: POST_ID, serviceId: SERVICE_ID });
    prismaMock.parentPostComment.create.mockResolvedValue({
      id: "c-new",
      body: "thanks!",
      createdAt: new Date("2026-04-23"),
      staffAuthor: { name: "Sarah Smith" },
    });
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments`, {
      body: { body: "thanks!" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ authorName: "Sarah S.", authorType: "staff" });
  });
});

describe("DELETE /api/services/[id]/parent-posts/[postId]/comments/[commentId]", () => {
  const context = {
    params: Promise.resolve({ id: SERVICE_ID, postId: POST_ID, commentId: COMMENT_ID }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("DELETE", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments/${COMMENT_ID}`);
    const res = await DELETE(req, context);
    expect(res.status).toBe(401);
  });

  it("404 when comment does not exist", async () => {
    mockSession({ id: "u1", name: "X", role: "admin", serviceId: SERVICE_ID });
    prismaMock.parentPostComment.findUnique.mockResolvedValue(null);
    const req = createRequest("DELETE", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments/${COMMENT_ID}`);
    const res = await DELETE(req, context);
    expect(res.status).toBe(404);
  });

  it("404 when comment's post is in a different service", async () => {
    mockSession({ id: "u1", name: "X", role: "admin", serviceId: SERVICE_ID });
    prismaMock.parentPostComment.findUnique.mockResolvedValue({
      id: COMMENT_ID,
      postId: POST_ID,
      post: { serviceId: "svc-other" },
    });
    const req = createRequest("DELETE", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments/${COMMENT_ID}`);
    const res = await DELETE(req, context);
    expect(res.status).toBe(404);
  });

  it("200 and deletes the comment", async () => {
    mockSession({ id: "u1", name: "X", role: "admin", serviceId: SERVICE_ID });
    prismaMock.parentPostComment.findUnique.mockResolvedValue({
      id: COMMENT_ID,
      postId: POST_ID,
      post: { serviceId: SERVICE_ID },
    });
    prismaMock.parentPostComment.delete.mockResolvedValue({ id: COMMENT_ID });
    const req = createRequest("DELETE", `/api/services/${SERVICE_ID}/parent-posts/${POST_ID}/comments/${COMMENT_ID}`);
    const res = await DELETE(req, context);
    expect(res.status).toBe(200);
    expect(prismaMock.parentPostComment.delete).toHaveBeenCalledWith({
      where: { id: COMMENT_ID },
    });
  });
});
