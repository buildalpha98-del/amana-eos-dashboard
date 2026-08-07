/**
 * The planning cycle: posts that follow up on earlier observations.
 *
 * NQS Element 1.3 asks what you DID about what you noticed. The rules
 * that make the thread trustworthy: a follow-up can only extend a post
 * at the same centre, and a follow-up to a follow-up threads back to the
 * original observation rather than forming a chain nobody can read.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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
vi.mock("@/lib/notifications/posts", () => ({
  notifyPostPublished: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/parent-notifications", () => ({
  notifyParentNewPost: vi.fn(() => Promise.resolve()),
}));

import { POST } from "@/app/api/services/[id]/parent-posts/route";
import { GET as NEEDS_GET } from "@/app/api/services/[id]/parent-posts/needs-follow-up/route";

const ctx = (id = "svc-1") => ({ params: Promise.resolve({ id }) });

const body = (extra: Record<string, unknown> = {}) => ({
  title: "Ramps for the block builders",
  content: "We put out ramps after last week's tower play.",
  type: "observation",
  ...extra,
});

describe("post follow-ups", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
    prismaMock.parentPost.create.mockResolvedValue({
      id: "post-new",
      title: "t",
      tags: [],
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (fn: never) =>
      typeof fn === "function" ? (fn as (tx: unknown) => unknown)(prismaMock) : fn,
    );
  });

  it("links a follow-up to the observation it came from", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "obs-1",
      serviceId: "svc-1",
      extendsPostId: null,
    });
    const res = await POST(
      createRequest("POST", "/x", { body: body({ extendsPostId: "obs-1" }) }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.parentPost.create.mock.calls[0][0].data.extendsPostId).toBe(
      "obs-1",
    );
  });

  it("refuses to thread onto another centre's post", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "obs-x",
      serviceId: "svc-OTHER",
      extendsPostId: null,
    });
    const res = await POST(
      createRequest("POST", "/x", { body: body({ extendsPostId: "obs-x" }) }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.parentPost.create).not.toHaveBeenCalled();
  });

  it("flattens a follow-up of a follow-up back to the original", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    // Extending a post that itself extends "obs-1".
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "follow-1",
      serviceId: "svc-1",
      extendsPostId: "obs-1",
    });
    await POST(
      createRequest("POST", "/x", { body: body({ extendsPostId: "follow-1" }) }),
      ctx(),
    );
    // The thread reads "here's what we saw, and everything we did about
    // it" — not a chain that has to be walked.
    expect(prismaMock.parentPost.create.mock.calls[0][0].data.extendsPostId).toBe(
      "obs-1",
    );
  });

  it("a plain post carries no link", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    await POST(createRequest("POST", "/x", { body: body() }), ctx());
    expect(
      prismaMock.parentPost.create.mock.calls[0][0].data.extendsPostId,
    ).toBeUndefined();
  });
});

describe("GET needs-follow-up", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("asks only for published observations with nothing following them", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.parentPost.findMany.mockResolvedValue([]);
    await NEEDS_GET(createRequest("GET", "/x"), ctx());
    const where = prismaMock.parentPost.findMany.mock.calls[0][0].where;
    expect(where.type).toBe("observation");
    expect(where.status).toBe("published");
    // A follow-up is itself an answer; it doesn't need one.
    expect(where.extendsPostId).toBeNull();
    expect(where.extensions).toEqual({ none: {} });
  });

  it("reports how long an observation has been sitting", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    const twentyDaysAgo = new Date(Date.now() - 20 * 86400_000);
    prismaMock.parentPost.findMany.mockResolvedValue([
      {
        id: "obs-1",
        title: "Tower building",
        createdAt: twentyDaysAgo,
        mtopOutcomes: ["Learning"],
        tags: [{ child: { id: "k1", firstName: "Amira" } }],
      },
    ]);
    const body = await (
      await NEEDS_GET(createRequest("GET", "/x"), ctx())
    ).json();
    expect(body.posts[0].daysAgo).toBe(20);
    expect(body.posts[0].children).toEqual(["Amira"]);
  });
});
