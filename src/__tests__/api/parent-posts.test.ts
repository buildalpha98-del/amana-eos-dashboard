import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
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

import { GET, POST } from "@/app/api/services/[id]/parent-posts/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const SERVICE_ID = "svc-1";
const context = { params: Promise.resolve({ id: SERVICE_ID }) };

describe("GET /api/services/[id]/parent-posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", `/api/services/${SERVICE_ID}/parent-posts`);
    const res = await GET(req, context);
    expect(res.status).toBe(401);
  });

  it("returns 403 when staff member does not belong to service", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member", serviceId: "svc-other" });
    const req = createRequest("GET", `/api/services/${SERVICE_ID}/parent-posts`);
    const res = await GET(req, context);
    expect(res.status).toBe(403);
  });

  it("allows owner to access any service", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner", serviceId: "svc-other" });
    prismaMock.parentPost.findMany.mockResolvedValue([]);
    const req = createRequest("GET", `/api/services/${SERVICE_ID}/parent-posts`);
    const res = await GET(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  it("returns posts for the correct service", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.parentPost.findMany.mockResolvedValue([
      {
        id: "p-1",
        title: "Test Post",
        content: "Hello",
        type: "observation",
        tags: [],
        _count: { likes: 3, comments: 2 },
      },
    ]);
    const req = createRequest("GET", `/api/services/${SERVICE_ID}/parent-posts`);
    const res = await GET(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe("Test Post");
    expect(body.items[0].likeCount).toBe(3);
    expect(body.items[0].commentCount).toBe(2);
  });
});

describe("POST /api/services/[id]/parent-posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Test", content: "Hello", type: "observation" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(401);
  });

  it("returns 403 for staff on different service", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member", serviceId: "svc-other" });
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Test", content: "Hello" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(403);
  });

  it("returns 400 when title is missing", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { content: "Hello" },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(400);
  });

  it("ALLOWS an untagged post — tagging no longer decides visibility", async () => {
    // Changed 2026-08-04: a post with no tags is an ordinary centre-wide
    // update. Tags now decide which child's page it also appears on, not
    // who is allowed to see it.
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock),
    );
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.parentPost.create.mockResolvedValue({ id: "post-1", tags: [] });
    prismaMock.activityLog.create.mockResolvedValue({});

    const res = await POST(
      createRequest("POST", "/api/services/svc-1/parent-posts", {
        body: {
          title: "Excursion tomorrow",
          content: "Hats please.",
          isCommunity: false,
          childIds: [],
        },
      }),
      { params: Promise.resolve({ id: "svc-1" }) },
    );
    expect(res.status).not.toBe(400);
  });

  it("returns 404 when service does not exist", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    // $transaction: run interactive callback
    prismaMock.service.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Test", content: "Hello", isCommunity: true },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(404);
  });

  it("returns 400 when child IDs don't belong to service", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue({ id: SERVICE_ID });
    prismaMock.child.findMany.mockResolvedValue([]); // No matching children

    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Test", content: "Hello", childIds: ["child-wrong"] },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("do not belong to this service");
  });

  it("creates a community post successfully (201)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.service.findUnique.mockResolvedValue({ id: SERVICE_ID });
    const created = {
      id: "p-new",
      title: "Announcement",
      content: "Hello parents",
      type: "announcement",
      isCommunity: true,
      tags: [],
      author: { id: "user-1", name: "Test", image: null },
    };
    prismaMock.parentPost.create.mockResolvedValue(created);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Announcement", content: "Hello parents", type: "announcement", isCommunity: true },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("p-new");
  });

  it("creates a child-tagged post with valid children (201)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.service.findUnique.mockResolvedValue({ id: SERVICE_ID });
    prismaMock.child.findMany.mockResolvedValue([{ id: "child-1" }]);
    const created = {
      id: "p-tagged",
      title: "Great day",
      content: "Sarah had fun",
      type: "observation",
      isCommunity: false,
      tags: [{ id: "t-1", child: { id: "child-1", firstName: "Sarah", surname: "Smith" } }],
      author: { id: "user-1", name: "Test", image: null },
    };
    prismaMock.parentPost.create.mockResolvedValue(created);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Great day", content: "Sarah had fun", childIds: ["child-1"] },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tags).toHaveLength(1);
  });

  it("rejects mediaUrls from disallowed domains", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: {
        title: "Photo day",
        content: "See attached",
        isCommunity: true,
        mediaUrls: ["https://evil.com/tracker.png"],
      },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details?.mediaUrls).toBeDefined();
  });

  it("rejects more than 30 mediaUrls", async () => {
    // Cap raised 6 → 30 with post scheduling + curriculum tags (a076026f).
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    const mediaUrls = Array.from(
      { length: 31 },
      (_, i) => `https://abc${i}.public.blob.vercel-storage.com/img-${i}.jpg`,
    );
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Gallery", content: "test", isCommunity: true, mediaUrls },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details?.mediaUrls).toBeDefined();
  });

  it("accepts up to 30 mediaUrls", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.service.findUnique.mockResolvedValue({ id: SERVICE_ID });
    prismaMock.parentPost.create.mockResolvedValue({
      id: "p-gallery",
      tags: [],
      author: null,
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    const mediaUrls = Array.from(
      { length: 30 },
      (_, i) => `https://abc${i}.public.blob.vercel-storage.com/img-${i}.jpg`,
    );
    const req = createRequest("POST", `/api/services/${SERVICE_ID}/parent-posts`, {
      body: { title: "Gallery", content: "test", isCommunity: true, mediaUrls },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(201);
  });
}
);
