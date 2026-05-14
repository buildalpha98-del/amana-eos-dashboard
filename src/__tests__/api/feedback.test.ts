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

import { GET } from "@/app/api/feedback/route";
import { PATCH } from "@/app/api/feedback/[id]/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/feedback", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 without session", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/feedback"));
    expect(res.status).toBe(401);
  });

  it("returns rows filtered by status", async () => {
    mockSession({ id: "u1", name: "Test", role: "admin" });
    prismaMock.parentFeedback.findMany.mockResolvedValue([
      { id: "fb-1", status: "new", comments: "hi" },
    ]);

    const res = await GET(createRequest("GET", "/api/feedback?status=new"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);

    const findArgs = prismaMock.parentFeedback.findMany.mock.calls[0][0];
    expect(findArgs.where.status).toBe("new");
  });

  it("400 on invalid status query", async () => {
    mockSession({ id: "u1", name: "Test", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/feedback?status=banana"),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/feedback/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("stamps reviewedAt + reviewedById when status leaves 'new'", async () => {
    mockSession({ id: "user-99", name: "Reviewer", role: "admin" });
    prismaMock.parentFeedback.findUnique.mockResolvedValue({
      id: "fb-1",
      status: "new",
    });
    prismaMock.parentFeedback.update.mockResolvedValue({
      id: "fb-1",
      status: "actioned",
    });

    const res = await PATCH(
      createRequest("PATCH", "/api/feedback/fb-1", {
        body: { status: "actioned" },
      }),
      ctx("fb-1"),
    );

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.parentFeedback.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("actioned");
    expect(updateArgs.data.reviewedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.reviewedById).toBe("user-99");
  });

  it("clears reviewedAt + reviewedById when re-opening to 'new'", async () => {
    mockSession({ id: "user-99", name: "Reviewer", role: "admin" });
    prismaMock.parentFeedback.findUnique.mockResolvedValue({
      id: "fb-1",
      status: "actioned",
    });
    prismaMock.parentFeedback.update.mockResolvedValue({});

    await PATCH(
      createRequest("PATCH", "/api/feedback/fb-1", {
        body: { status: "new" },
      }),
      ctx("fb-1"),
    );

    const updateArgs = prismaMock.parentFeedback.update.mock.calls[0][0];
    expect(updateArgs.data.reviewedAt).toBeNull();
    expect(updateArgs.data.reviewedById).toBeNull();
  });

  it("404 when feedback id does not exist", async () => {
    mockSession({ id: "user-99", name: "Reviewer", role: "admin" });
    prismaMock.parentFeedback.findUnique.mockResolvedValue(null);

    const res = await PATCH(
      createRequest("PATCH", "/api/feedback/missing", {
        body: { status: "actioned" },
      }),
      ctx("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("does NOT re-stamp reviewedAt when status is unchanged but notes are added", async () => {
    mockSession({ id: "user-99", name: "Reviewer", role: "admin" });
    prismaMock.parentFeedback.findUnique.mockResolvedValue({
      id: "fb-1",
      status: "actioned",
    });
    prismaMock.parentFeedback.update.mockResolvedValue({});

    await PATCH(
      createRequest("PATCH", "/api/feedback/fb-1", {
        body: { notes: "Followed up by phone" },
      }),
      ctx("fb-1"),
    );

    const updateArgs = prismaMock.parentFeedback.update.mock.calls[0][0];
    expect(updateArgs.data.reviewedAt).toBeUndefined();
    expect(updateArgs.data.reviewedById).toBeUndefined();
    expect(updateArgs.data.notes).toBe("Followed up by phone");
  });
});
